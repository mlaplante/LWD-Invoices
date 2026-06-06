/**
 * Golden corpus for the month-end close core (`reconcileBooks`,
 * `draftAdjustingEntries`, `summarizeClose`).
 *
 * Each case pins a set of period snapshots against the reconciliation
 * exceptions, drafted adjusting entries, and close-readiness the agent must
 * produce. The integrity invariants are `critical`: a PAID invoice with no
 * covering payment overstates revenue, a lost dispute leaves recognized revenue
 * un-reversed, and a duplicate expense double-counts cash — none may silently
 * stop being flagged, and none may leave the period falsely "ready to close".
 */

import { InvoiceStatus, InvoiceType, RefundStatus, DisputeStatus } from "@/generated/prisma";
import type { EvalCase } from "../types";
import type { MonthEndCloseExpected, MonthEndCloseInput } from "../graders";
import { detectExpenseAnomalies, type AnomalyExpense } from "../../expense-anomaly";
import type {
  CloseAnomalies,
  CloseDispute,
  CloseExpense,
  CloseInvoice,
  CloseRefund,
  ReconcileInput,
} from "../../month-end-close";

function invoice(overrides: Partial<CloseInvoice> = {}): CloseInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    number: "INV-1000",
    clientName: "Acme Corp",
    status: InvoiceStatus.PAID,
    type: InvoiceType.DETAILED,
    total: 1000,
    paid: 1000,
    ...overrides,
  };
}

function reconcile(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return { invoices: [], refunds: [], disputes: [], expenses: [], ...overrides };
}

const NO_ANOMALIES: CloseAnomalies = { duplicates: [], outliers: [] };

/** Build a real duplicate group via the shipped detector (no hand-rolled shapes). */
function duplicateAnomalies(amount: number, count: number): CloseAnomalies {
  const base = new Date("2026-05-10T00:00:00Z");
  const expenses: AnomalyExpense[] = Array.from({ length: count }, (_, i) => ({
    id: `dup-${i}`,
    supplierKey: "aws",
    supplierName: "AWS",
    amount,
    date: base,
    description: "Cloud hosting",
  }));
  const report = detectExpenseAnomalies(expenses);
  return { duplicates: report.duplicates, outliers: [] };
}

function expense(overrides: Partial<CloseExpense> = {}): CloseExpense {
  return { id: Math.random().toString(36).slice(2), supplierName: "AWS", amount: 200, categoryName: "Software", ...overrides };
}

function refund(overrides: Partial<CloseRefund> = {}): CloseRefund {
  return { id: Math.random().toString(36).slice(2), amount: 100, status: RefundStatus.PENDING, invoiceNumber: "INV-1000", ...overrides };
}

function dispute(overrides: Partial<CloseDispute> = {}): CloseDispute {
  return { id: Math.random().toString(36).slice(2), amount: 500, status: DisputeStatus.LOST, invoiceNumber: "INV-1000", ...overrides };
}

export const monthEndCloseCases: ReadonlyArray<EvalCase<MonthEndCloseInput, MonthEndCloseExpected>> = [
  // ── Clean period ───────────────────────────────────────────────────────────
  {
    id: "clean-books-ready",
    description: "Fully paid invoice, categorized expense, no anomalies — ready to close.",
    input: {
      reconcile: reconcile({
        invoices: [invoice({ number: "INV-1", total: 1000, paid: 1000, status: InvoiceStatus.PAID })],
        expenses: [expense({ categoryName: "Software" })],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "clean", severity: "ok" }],
      forbidChecks: ["marked_paid_underfunded", "overpaid", "uncategorized_expenses"],
      canClose: true,
    },
  },

  // ── Revenue integrity: PAID but underfunded (critical) ───────────────────────
  {
    id: "paid-without-payment",
    description: "Invoice marked PAID with no covering payment overstates revenue — blocks close.",
    critical: true,
    input: {
      reconcile: reconcile({
        invoices: [invoice({ number: "INV-2", total: 1000, paid: 0, status: InvoiceStatus.PAID })],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "marked_paid_underfunded", severity: "error" }],
      canClose: false,
    },
  },

  // ── Lost dispute not reversed (critical) ─────────────────────────────────────
  {
    id: "lost-dispute-blocks",
    description: "A lost chargeback reverses revenue and must be booked before close.",
    critical: true,
    input: {
      reconcile: reconcile({
        invoices: [invoice({ number: "INV-3", total: 500, paid: 500 })],
        disputes: [dispute({ amount: 500, status: DisputeStatus.LOST, invoiceNumber: "INV-3" })],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "lost_disputes", severity: "error" }],
      expectAdjustments: ["reverse_lost_dispute"],
      canClose: false,
    },
  },

  // ── Duplicate expense (critical: cash double-count) ──────────────────────────
  {
    id: "duplicate-expense-drafts-reversal",
    description: "Same-day duplicate expense drafts a reversal of the redundant copy.",
    critical: true,
    input: {
      reconcile: reconcile({ expenses: [expense({ categoryName: "Software" })] }),
      anomalies: duplicateAnomalies(200, 2),
    },
    expected: {
      expectAdjustments: ["reverse_duplicate_expense"],
      // Duplicates are warnings, not blocking errors.
      canClose: true,
    },
  },

  // ── Overpayment → warning + write-off draft, still closeable ─────────────────
  {
    id: "overpaid-invoice",
    description: "Invoice paid above billed amount flags a warning and drafts a write-off.",
    input: {
      reconcile: reconcile({
        invoices: [invoice({ number: "INV-4", total: 1000, paid: 1250, status: InvoiceStatus.PAID })],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "overpaid", severity: "warning" }],
      expectAdjustments: ["write_off_overpayment"],
      forbidChecks: ["marked_paid_underfunded"],
      canClose: true,
    },
  },

  // ── Fully covered but still open → warning ───────────────────────────────────
  {
    id: "covered-not-marked-paid",
    description: "Open invoice fully covered by payments overstates AR — warning only.",
    input: {
      reconcile: reconcile({
        invoices: [invoice({ number: "INV-5", total: 800, paid: 800, status: InvoiceStatus.SENT })],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "covered_not_marked_paid", severity: "warning" }],
      canClose: true,
    },
  },

  // ── Uncategorized expenses → warning + reclass draft ─────────────────────────
  {
    id: "uncategorized-expenses",
    description: "Expense without a category needs reclassification before the P&L is complete.",
    input: {
      reconcile: reconcile({ expenses: [expense({ categoryName: null, amount: 350 })] }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "uncategorized_expenses", severity: "warning" }],
      expectAdjustments: ["reclass_uncategorized"],
      canClose: true,
    },
  },

  // ── Pending refund → warning ─────────────────────────────────────────────────
  {
    id: "pending-refund-warning",
    description: "An unsettled refund means period cash-out isn't final — warning, not blocking.",
    input: {
      reconcile: reconcile({ refunds: [refund({ amount: 120, status: RefundStatus.PENDING })] }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      expectChecks: [{ check: "pending_refunds", severity: "warning" }],
      canClose: true,
    },
  },

  // ── Estimates / drafts are not held to payment integrity ─────────────────────
  {
    id: "estimate-not-flagged",
    description: "An accepted estimate with no payment must not be flagged as underfunded revenue.",
    input: {
      reconcile: reconcile({
        invoices: [
          invoice({ number: "EST-1", type: InvoiceType.ESTIMATE, status: InvoiceStatus.ACCEPTED, total: 5000, paid: 0 }),
        ],
      }),
      anomalies: NO_ANOMALIES,
    },
    expected: {
      forbidChecks: ["marked_paid_underfunded", "overpaid"],
      expectChecks: [{ check: "clean", severity: "ok" }],
      canClose: true,
    },
  },
];
