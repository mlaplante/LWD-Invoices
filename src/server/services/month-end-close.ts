/**
 * Month-end close agent — the agentic capstone.
 *
 * Composes the pieces already shipped (analytics data-access, expense anomaly
 * detection, disputes/refunds, the assistant's grounding guard) into a single
 * "close the books for the month" workflow:
 *
 *   reconcile → flag anomalies → draft adjusting entries → present for approval.
 *
 * The heavy lifting is deterministic and pure (`reconcileBooks`,
 * `draftAdjustingEntries`, `summarizeClose`, `closeHeadline`) so it is unit- and
 * eval-gradeable with no model calls. `buildMonthEndClose` is the DB composer
 * that snapshots a period; `composeCloseNarrative` adds an optional grounded
 * natural-language summary (Gemini-first like the rest of the AI features) that
 * falls back to the deterministic headline — and is itself guarded by the same
 * answer-grounding check the books assistant ships, so the narrative can never
 * state a dollar figure the report doesn't contain.
 *
 * Closing is never autonomous: the agent reconciles and *proposes*, and the
 * actual one-click close is a human-approved, role-gated router mutation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { db as Db } from "../db";
import { InvoiceStatus, InvoiceType, RefundStatus, DisputeStatus } from "@/generated/prisma";
import { toNum, OPEN_STATUSES } from "./analytics-data";
import {
  detectExpenseAnomalies,
  type AnomalyExpense,
  type DuplicateExpenseGroup,
  type OutlierExpense,
} from "./expense-anomaly";
import { checkAnswerGrounding } from "./ai-eval/grounding";
import {
  callGeminiWithModelFallback,
  resolveGeminiModels,
} from "./gemini-fallback";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
const DEFAULT_GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
const PENNY = 0.01;

// ─── Snapshot input shapes (kept minimal so the pure core is testable) ──────────

export interface CloseInvoice {
  id: string;
  number: string;
  clientName: string;
  status: InvoiceStatus;
  type: InvoiceType;
  total: number;
  /** Lifetime payments recorded against the invoice (not just this period). */
  paid: number;
}

export interface CloseRefund {
  id: string;
  amount: number;
  status: RefundStatus;
  invoiceNumber: string;
}

export interface CloseDispute {
  id: string;
  amount: number;
  status: DisputeStatus;
  invoiceNumber: string | null;
}

export interface CloseExpense {
  id: string;
  supplierName: string;
  amount: number;
  categoryName: string | null;
}

export interface ReconcileInput {
  /** Invoices issued within the period (revenue + estimates + credit notes). */
  invoices: CloseInvoice[];
  /** Refunds booked within the period. */
  refunds: CloseRefund[];
  /** Disputes touching the period (open or resolved within it). */
  disputes: CloseDispute[];
  /** Expenses booked within the period. */
  expenses: CloseExpense[];
}

// ─── Output shapes ──────────────────────────────────────────────────────────────

export type ReconSeverity = "ok" | "warning" | "error";

export interface ReconciliationItem {
  /** Stable id for the check (used by tests/evals and the UI). */
  check: string;
  title: string;
  severity: ReconSeverity;
  detail: string;
  /** Invoice numbers / references involved, for drill-down. */
  refs: string[];
  /** Dollar amount at stake, when meaningful. */
  amount?: number;
}

export type AdjustingEntryKind =
  | "reverse_duplicate_expense"
  | "write_off_overpayment"
  | "reclass_uncategorized"
  | "reverse_lost_dispute";

export interface AdjustingEntry {
  kind: AdjustingEntryKind;
  title: string;
  amount: number;
  description: string;
  refs: string[];
  /** What the owner would do to apply this (the close agent proposes, never acts). */
  suggestedAction: string;
}

export interface CloseAnomalies {
  duplicates: DuplicateExpenseGroup[];
  outliers: OutlierExpense[];
}

export interface CloseSummary {
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
  outlierCount: number;
  adjustmentCount: number;
  duplicateExposure: number;
  /** No blocking errors → safe to close (warnings are advisory, not blocking). */
  canClose: boolean;
  headline: string;
}

export interface CloseTotals {
  invoiced: number;
  collected: number;
  refunded: number;
  expenses: number;
  netCash: number;
}

export interface MonthEndCloseReport {
  period: { year: number; month: number; label: string; start: string; end: string };
  generatedAt: string;
  currencySymbol: string;
  /** True once the period has fully elapsed — the router only closes elapsed periods. */
  periodElapsed: boolean;
  totals: CloseTotals;
  reconciliation: ReconciliationItem[];
  anomalies: CloseAnomalies;
  adjustments: AdjustingEntry[];
  summary: CloseSummary;
  /** Grounded narrative (AI when available, deterministic headline otherwise). */
  narrative: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function usd(value: number): string {
  return `$${round(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A revenue-bearing invoice we expect to be paid (excludes estimates + credit notes). */
function isRevenueInvoice(type: InvoiceType): boolean {
  return type !== InvoiceType.ESTIMATE && type !== InvoiceType.CREDIT_NOTE;
}

const OPEN_SET = new Set<InvoiceStatus>(OPEN_STATUSES);

// ─── Pure: reconciliation ───────────────────────────────────────────────────────

/**
 * Tie out the period's books and surface every exception that should be cleared
 * (or consciously accepted) before the month is locked. Deterministic: same
 * input → same items, so the suite below can pin the behavior.
 */
export function reconcileBooks(input: ReconcileInput): ReconciliationItem[] {
  const items: ReconciliationItem[] = [];

  // ── Invoice ↔ payment integrity ──
  const underfunded: { ref: string; amount: number }[] = [];
  const coveredNotMarked: { ref: string; amount: number }[] = [];
  const overpaid: { ref: string; amount: number }[] = [];

  for (const inv of input.invoices) {
    if (!isRevenueInvoice(inv.type) || inv.status === InvoiceStatus.DRAFT) continue;
    const balance = inv.total - inv.paid;

    if (inv.status === InvoiceStatus.PAID && balance > PENNY) {
      underfunded.push({ ref: inv.number, amount: round(balance) });
    } else if (OPEN_SET.has(inv.status) && inv.total > 0 && balance <= PENNY) {
      coveredNotMarked.push({ ref: inv.number, amount: round(inv.total) });
    }

    if (inv.paid - inv.total > PENNY) {
      overpaid.push({ ref: inv.number, amount: round(inv.paid - inv.total) });
    }
  }

  if (underfunded.length > 0) {
    const total = round(underfunded.reduce((s, u) => s + u.amount, 0));
    items.push({
      check: "marked_paid_underfunded",
      title: "Invoices marked paid without full payment",
      severity: "error",
      detail: `${underfunded.length} invoice(s) are marked PAID but the recorded payments fall ${usd(total)} short. The revenue is overstated until this is corrected.`,
      refs: underfunded.map((u) => u.ref),
      amount: total,
    });
  }
  if (coveredNotMarked.length > 0) {
    items.push({
      check: "covered_not_marked_paid",
      title: "Fully paid invoices still open",
      severity: "warning",
      detail: `${coveredNotMarked.length} invoice(s) are fully covered by payments but still show as open — mark them paid so AR isn't overstated.`,
      refs: coveredNotMarked.map((c) => c.ref),
      amount: round(coveredNotMarked.reduce((s, c) => s + c.amount, 0)),
    });
  }
  if (overpaid.length > 0) {
    const total = round(overpaid.reduce((s, o) => s + o.amount, 0));
    items.push({
      check: "overpaid",
      title: "Overpaid invoices",
      severity: "warning",
      detail: `${overpaid.length} invoice(s) received ${usd(total)} more than billed — refund or credit the difference.`,
      refs: overpaid.map((o) => o.ref),
      amount: total,
    });
  }

  // ── Pending (unsettled) refunds ──
  const pendingRefunds = input.refunds.filter((r) => r.status === RefundStatus.PENDING);
  if (pendingRefunds.length > 0) {
    items.push({
      check: "pending_refunds",
      title: "Refunds still pending",
      severity: "warning",
      detail: `${pendingRefunds.length} refund(s) totaling ${usd(pendingRefunds.reduce((s, r) => s + r.amount, 0))} have not settled — cash-out for the period is not final.`,
      refs: pendingRefunds.map((r) => r.invoiceNumber),
      amount: round(pendingRefunds.reduce((s, r) => s + r.amount, 0)),
    });
  }

  // ── Disputes ──
  const lostDisputes = input.disputes.filter((d) => d.status === DisputeStatus.LOST);
  const openDisputes = input.disputes.filter(
    (d) => d.status === DisputeStatus.NEEDS_RESPONSE || d.status === DisputeStatus.UNDER_REVIEW,
  );
  if (lostDisputes.length > 0) {
    const total = round(lostDisputes.reduce((s, d) => s + d.amount, 0));
    items.push({
      check: "lost_disputes",
      title: "Lost disputes not reversed",
      severity: "error",
      detail: `${lostDisputes.length} dispute(s) were lost for ${usd(total)} — the chargeback reverses recognized revenue and must be booked before close.`,
      refs: lostDisputes.map((d) => d.invoiceNumber ?? d.id),
      amount: total,
    });
  }
  if (openDisputes.length > 0) {
    items.push({
      check: "open_disputes",
      title: "Open disputes outstanding",
      severity: "warning",
      detail: `${openDisputes.length} dispute(s) totaling ${usd(openDisputes.reduce((s, d) => s + d.amount, 0))} are still being decided — a contingent reversal for the period.`,
      refs: openDisputes.map((d) => d.invoiceNumber ?? d.id),
      amount: round(openDisputes.reduce((s, d) => s + d.amount, 0)),
    });
  }

  // ── Uncategorized expenses ──
  const uncategorized = input.expenses.filter((e) => !e.categoryName);
  if (uncategorized.length > 0) {
    items.push({
      check: "uncategorized_expenses",
      title: "Uncategorized expenses",
      severity: "warning",
      detail: `${uncategorized.length} expense(s) totaling ${usd(uncategorized.reduce((s, e) => s + e.amount, 0))} have no category — classify them so the P&L is complete.`,
      refs: uncategorized.map((e) => e.supplierName),
      amount: round(uncategorized.reduce((s, e) => s + e.amount, 0)),
    });
  }

  if (items.length === 0) {
    items.push({
      check: "clean",
      title: "Books reconciled",
      severity: "ok",
      detail: "No reconciliation exceptions found for the period.",
      refs: [],
    });
  }

  return items;
}

// ─── Pure: adjusting-entry drafting ─────────────────────────────────────────────

/**
 * Propose the adjusting entries that would clear the findings. Each is a draft
 * the owner reviews and applies — the agent never books them automatically.
 */
export function draftAdjustingEntries(
  input: ReconcileInput,
  anomalies: CloseAnomalies,
  reconciliation: ReconciliationItem[],
): AdjustingEntry[] {
  const entries: AdjustingEntry[] = [];

  // Reverse suspected duplicate expenses (the redundant copies beyond the first).
  for (const group of anomalies.duplicates) {
    const redundant = group.expenseIds.length - 1;
    if (redundant < 1) continue;
    const amount = round(group.amount * redundant);
    entries.push({
      kind: "reverse_duplicate_expense",
      title: `Reverse duplicate expense — ${group.supplierName}`,
      amount,
      description: `${redundant} redundant copy(ies) of a ${usd(group.amount)} ${group.supplierName} expense inflate costs by ${usd(amount)}.`,
      refs: group.expenseIds,
      suggestedAction: `Delete ${redundant} duplicate expense(s) from ${group.supplierName}, keeping one.`,
    });
  }

  // Write off overpayments (one entry summing the excess across invoices).
  const overpaid = reconciliation.find((r) => r.check === "overpaid");
  if (overpaid && overpaid.amount && overpaid.amount > 0) {
    entries.push({
      kind: "write_off_overpayment",
      title: "Clear customer overpayments",
      amount: overpaid.amount,
      description: `${usd(overpaid.amount)} collected above what was billed across ${overpaid.refs.length} invoice(s).`,
      refs: overpaid.refs,
      suggestedAction: "Issue a refund or apply the balance as a client credit.",
    });
  }

  // Reclassify uncategorized expenses.
  const uncategorized = reconciliation.find((r) => r.check === "uncategorized_expenses");
  if (uncategorized && uncategorized.amount && uncategorized.amount > 0) {
    entries.push({
      kind: "reclass_uncategorized",
      title: "Categorize uncategorized expenses",
      amount: uncategorized.amount,
      description: `${uncategorized.refs.length} expense(s) for ${usd(uncategorized.amount)} need a category before the P&L is complete.`,
      refs: uncategorized.refs,
      suggestedAction: "Assign an expense category to each uncategorized expense.",
    });
  }

  // Reverse revenue for lost disputes.
  const lost = reconciliation.find((r) => r.check === "lost_disputes");
  if (lost && lost.amount && lost.amount > 0) {
    entries.push({
      kind: "reverse_lost_dispute",
      title: "Book chargeback losses",
      amount: lost.amount,
      description: `${usd(lost.amount)} of recognized revenue was reversed by lost chargeback(s).`,
      refs: lost.refs,
      suggestedAction: "Record the chargeback loss against the disputed invoice(s).",
    });
  }

  return entries;
}

// ─── Pure: summary + headline ───────────────────────────────────────────────────

export function summarizeClose(args: {
  reconciliation: ReconciliationItem[];
  anomalies: CloseAnomalies;
  adjustments: AdjustingEntry[];
}): CloseSummary {
  const errorCount = args.reconciliation.filter((r) => r.severity === "error").length;
  const warningCount = args.reconciliation.filter((r) => r.severity === "warning").length;
  const duplicateCount = args.anomalies.duplicates.length;
  const outlierCount = args.anomalies.outliers.length;
  const duplicateExposure = round(
    args.anomalies.duplicates.reduce((s, g) => s + g.amount * (g.expenseIds.length - 1), 0),
  );

  const canClose = errorCount === 0;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} blocking issue${errorCount === 1 ? "" : "s"}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  if (duplicateCount > 0) parts.push(`${duplicateCount} suspected duplicate${duplicateCount === 1 ? "" : "s"}`);
  if (outlierCount > 0) parts.push(`${outlierCount} expense outlier${outlierCount === 1 ? "" : "s"}`);
  if (args.adjustments.length > 0) {
    parts.push(`${args.adjustments.length} adjusting entr${args.adjustments.length === 1 ? "y" : "ies"} to review`);
  }

  const headline =
    parts.length === 0
      ? "Books are clean — ready to close."
      : `${canClose ? "Ready to close once reviewed" : "Resolve blocking issues before closing"}: ${parts.join(", ")}.`;

  return {
    errorCount,
    warningCount,
    duplicateCount,
    outlierCount,
    adjustmentCount: args.adjustments.length,
    duplicateExposure,
    canClose,
    headline,
  };
}

/**
 * Deterministic, always-grounded narrative used when no AI provider is
 * configured (and as the fallback when the AI draft fails the grounding guard).
 */
export function closeHeadline(report: Omit<MonthEndCloseReport, "narrative">): string {
  const t = report.totals;
  const lines = [
    `${report.period.label}: invoiced ${usd(t.invoiced)}, collected ${usd(t.collected)}, expenses ${usd(t.expenses)}, net cash ${usd(t.netCash)}.`,
    report.summary.headline,
  ];
  return lines.join(" ");
}

// ─── Period helpers ─────────────────────────────────────────────────────────────

export function monthRange(year: number, month: number): { start: Date; end: Date; label: string } {
  // month is 1-12.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, label: `${MONTH_NAMES[month - 1]} ${year}` };
}

/** The most recently *elapsed* month relative to `now` (the default close target). */
export function lastClosedMonth(now: Date): { year: number; month: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11; previous month in 1-12 terms is exactly this
  if (m === 0) return { year: y - 1, month: 12 };
  return { year: y, month: m };
}

// ─── DB composer ────────────────────────────────────────────────────────────────

export interface BuildMonthEndCloseOptions {
  year: number;
  month: number; // 1-12
  now?: Date;
}

/**
 * Build the full close report for a period from the org's live data. Pure
 * computation is delegated to the functions above; this only loads and shapes
 * the snapshots and runs the anomaly detector over a trailing baseline.
 */
export async function buildMonthEndClose(
  db: typeof Db,
  orgId: string,
  opts: BuildMonthEndCloseOptions,
): Promise<MonthEndCloseReport> {
  const now = opts.now ?? new Date();
  const { start, end, label } = monthRange(opts.year, opts.month);

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { currencies: { where: { isDefault: true }, select: { symbol: true }, take: 1 } },
  });
  const currencySymbol = org?.currencies[0]?.symbol ?? "$";

  // Anomaly detection needs trailing history for per-supplier baselines, so pull
  // five months before the period through period end, then filter results to the
  // period. Expense "date" matches the analytics builder (dueDate ?? createdAt).
  const anomalyStart = new Date(Date.UTC(opts.year, opts.month - 1 - 5, 1));

  const [periodInvoices, periodPayments, periodRefunds, periodDisputes, expenseRows] =
    await Promise.all([
      db.invoice.findMany({
        where: { organizationId: orgId, isArchived: false, date: { gte: start, lt: end } },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          total: true,
          client: { select: { name: true } },
          payments: { select: { amount: true } },
        },
      }),
      db.payment.findMany({
        where: { organizationId: orgId, paidAt: { gte: start, lt: end } },
        select: { amount: true },
      }),
      db.refund.findMany({
        where: { organizationId: orgId, createdAt: { gte: start, lt: end } },
        select: {
          id: true,
          amount: true,
          status: true,
          invoice: { select: { number: true } },
        },
      }),
      db.dispute.findMany({
        where: { organizationId: orgId, createdAt: { gte: start, lt: end } },
        select: { id: true, amount: true, status: true, invoice: { select: { number: true } } },
      }),
      db.expense.findMany({
        where: { organizationId: orgId, createdAt: { gte: anomalyStart, lt: end } },
        select: {
          id: true,
          name: true,
          rate: true,
          qty: true,
          createdAt: true,
          dueDate: true,
          supplierId: true,
          supplier: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
    ]);

  // ── Shape reconciliation input ──
  const invoices: CloseInvoice[] = periodInvoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: inv.client.name,
    status: inv.status,
    type: inv.type,
    total: toNum(inv.total),
    paid: inv.payments.reduce((s, p) => s + toNum(p.amount), 0),
  }));

  const refunds: CloseRefund[] = periodRefunds.map((r) => ({
    id: r.id,
    amount: toNum(r.amount),
    status: r.status,
    invoiceNumber: r.invoice?.number ?? "—",
  }));

  const disputes: CloseDispute[] = periodDisputes.map((d) => ({
    id: d.id,
    amount: toNum(d.amount),
    status: d.status,
    invoiceNumber: d.invoice?.number ?? null,
  }));

  // Partition expenses: anomaly inputs use the whole trailing window; period
  // membership uses the same date the analytics builder uses (dueDate ?? created).
  const anomalyInputs: AnomalyExpense[] = expenseRows.map((e) => {
    const supplierName = e.supplier?.name ?? "Uncategorized supplier";
    return {
      id: e.id,
      supplierKey: e.supplierId ?? `name:${supplierName.toLowerCase()}`,
      supplierName,
      amount: toNum(e.rate) * e.qty,
      date: e.dueDate ?? e.createdAt,
      description: e.name,
    };
  });

  const inPeriod = (d: Date) => d >= start && d < end;
  const periodExpenseIds = new Set(
    expenseRows.filter((e) => inPeriod(e.dueDate ?? e.createdAt)).map((e) => e.id),
  );

  const expenses: CloseExpense[] = expenseRows
    .filter((e) => periodExpenseIds.has(e.id))
    .map((e) => ({
      id: e.id,
      supplierName: e.supplier?.name ?? "Uncategorized supplier",
      amount: toNum(e.rate) * e.qty,
      categoryName: e.category?.name ?? null,
    }));

  // ── Anomalies (filtered to the period) ──
  const fullAnomalyReport = detectExpenseAnomalies(anomalyInputs, { now });
  const anomalies: CloseAnomalies = {
    duplicates: fullAnomalyReport.duplicates.filter((g) =>
      g.expenseIds.some((id) => periodExpenseIds.has(id)),
    ),
    outliers: fullAnomalyReport.outliers.filter((o) => periodExpenseIds.has(o.expenseId)),
  };

  // ── Totals ──
  const invoiced = round(
    invoices
      .filter((i) => isRevenueInvoice(i.type) && i.status !== InvoiceStatus.DRAFT)
      .reduce((s, i) => s + i.total, 0),
  );
  const collected = round(periodPayments.reduce((s, p) => s + toNum(p.amount), 0));
  const refunded = round(
    refunds.filter((r) => r.status === RefundStatus.SUCCEEDED).reduce((s, r) => s + r.amount, 0),
  );
  const expensesTotal = round(expenses.reduce((s, e) => s + e.amount, 0));
  const totals: CloseTotals = {
    invoiced,
    collected,
    refunded,
    expenses: expensesTotal,
    netCash: round(collected - refunded - expensesTotal),
  };

  // ── Pure core ──
  const reconcileInput: ReconcileInput = { invoices, refunds, disputes, expenses };
  const reconciliation = reconcileBooks(reconcileInput);
  const adjustments = draftAdjustingEntries(reconcileInput, anomalies, reconciliation);
  const summary = summarizeClose({ reconciliation, anomalies, adjustments });

  const base: Omit<MonthEndCloseReport, "narrative"> = {
    period: {
      year: opts.year,
      month: opts.month,
      label,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    generatedAt: now.toISOString(),
    currencySymbol,
    periodElapsed: end <= now,
    totals,
    reconciliation,
    anomalies,
    adjustments,
    summary,
  };

  const narrative = await composeCloseNarrative(base);

  return { ...base, narrative };
}

// ─── AI narrative (grounded, optional) ──────────────────────────────────────────

const NARRATIVE_SYSTEM = [
  "You are a meticulous bookkeeper drafting the month-end close summary for a small business owner.",
  "You are given a JSON close report (totals, reconciliation exceptions, anomalies, and drafted adjusting entries).",
  "Write a tight 2-4 sentence summary: the headline numbers, what needs attention before closing, and whether it looks ready to close.",
  "Use ONLY figures present in the JSON. Never invent amounts, invoice numbers, or client names. Format money with a $ and thousands separators.",
  "Be plain and direct. Do not use markdown headers or bullet lists — just prose.",
].join(" ");

/**
 * Produce a natural-language summary of the close. Tries the configured AI
 * provider (Gemini first, then Anthropic), but ALWAYS verifies the draft with
 * the same answer-grounding guard the books assistant ships — if the model
 * states a dollar figure the report doesn't contain, we discard it and fall back
 * to the deterministic headline. No provider configured → deterministic headline.
 */
export async function composeCloseNarrative(
  report: Omit<MonthEndCloseReport, "narrative">,
): Promise<string> {
  const fallback = closeHeadline(report);
  const payload = JSON.stringify({
    period: report.period.label,
    totals: report.totals,
    summary: report.summary,
    reconciliation: report.reconciliation.map((r) => ({
      title: r.title,
      severity: r.severity,
      detail: r.detail,
      amount: r.amount,
    })),
    anomalies: {
      duplicates: report.anomalies.duplicates.map((d) => d.message),
      outliers: report.anomalies.outliers.map((o) => o.message),
    },
    adjustments: report.adjustments.map((a) => ({ title: a.title, amount: a.amount, description: a.description })),
  });

  // Grounding the draft against the same structured report keeps any fabricated
  // dollar figure from reaching the owner — reusing the assistant's guard.
  const grounded = (text: string): boolean =>
    checkAnswerGrounding(text, [JSON.parse(payload)]).grounded;

  try {
    if (env.GEMINI_API_KEY) {
      const models = resolveGeminiModels(env.GEMINI_AGENT_MODELS, DEFAULT_GEMINI_MODELS);
      const text = await callGeminiWithModelFallback<string>({
        apiKey: env.GEMINI_API_KEY,
        models,
        body: {
          systemInstruction: { parts: [{ text: NARRATIVE_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: payload }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        },
        label: "month-end close narrative",
        onOk: (json) => geminiText(json),
      });
      const trimmed = text.trim();
      if (trimmed && grounded(trimmed)) return trimmed;
      return fallback;
    }

    if (env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const model = env.ANTHROPIC_AGENT_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
      const response = await client.messages.create({
        model,
        max_tokens: 400,
        system: NARRATIVE_SYSTEM,
        messages: [{ role: "user", content: payload }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text && grounded(text)) return text;
      return fallback;
    }
  } catch (err) {
    console.error("[month-end-close:narrative]", err);
  }

  return fallback;
}

function geminiText(json: Record<string, unknown>): string {
  const candidates = json.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = (candidates[0] as { content?: { parts?: unknown } }).content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
    .join("")
    .trim();
}
