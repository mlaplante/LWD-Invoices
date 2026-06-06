import { env } from "@/lib/env";
import { callGeminiWithModelFallback, extractGeminiText, resolveGeminiModels } from "./gemini-fallback";

export type InsightSeverity = "info" | "success" | "warning" | "danger";

export interface InsightCard {
  title: string;
  body: string;
  severity: InsightSeverity;
  metric?: string;
}

interface MoneyLike {
  toNumber?: () => number;
  valueOf?: () => unknown;
}

type Numeric = number | string | MoneyLike | null | undefined;

export interface CashFlowPaymentInput {
  amount: Numeric;
  paidAt: Date;
  invoice?: {
    clientId?: string | null;
    date?: Date | null;
    dueDate?: Date | null;
    client?: { name?: string | null } | null;
  } | null;
}

export interface CashFlowExpenseInput {
  rate: Numeric;
  qty: Numeric;
  createdAt: Date;
}

export interface CashFlowOpenInvoiceInput {
  id: string;
  total: Numeric;
  dueDate: Date | null;
  status: string;
  payments?: Array<{ amount: Numeric }>;
  client?: { id?: string | null; name?: string | null } | null;
}

export interface CashFlowRetainerTimeEntryInput {
  minutes: Numeric;
  invoiceLineId?: string | null;
  retainerId?: string | null;
  retainer?: {
    name?: string | null;
    clientId?: string | null;
    hourlyRate?: Numeric;
    client?: { name?: string | null } | null;
  } | null;
}

export interface CashFlowInsightInput {
  payments: CashFlowPaymentInput[];
  expenses: CashFlowExpenseInput[];
  openInvoices: CashFlowOpenInvoiceInput[];
  retainerTimeEntries: CashFlowRetainerTimeEntryInput[];
}

export interface PeriodMetrics {
  cashIn: number;
  cashOut: number;
  netCash: number;
  cashInChangePercent: number | null;
  cashOutChangePercent: number | null;
  netCashChangePercent: number | null;
}

export interface ReliablePayerInsight {
  clientId: string;
  clientName: string;
  paymentsCount: number;
  averageDaysLate: number;
}

export interface UnbilledRetainerOpportunity {
  clientId: string;
  clientName: string;
  retainerName: string;
  hours: number;
  estimatedValue: number | null;
}

export interface CashFlowInsightMetrics {
  generatedAt: string;
  insufficientData: boolean;
  assumptions: string[];
  currentMonth: PeriodMetrics;
  previousMonth: Omit<PeriodMetrics, "cashInChangePercent" | "cashOutChangePercent" | "netCashChangePercent">;
  currentQuarter: PeriodMetrics;
  previousQuarter: Omit<PeriodMetrics, "cashInChangePercent" | "cashOutChangePercent" | "netCashChangePercent">;
  overdue: { count: number; total: number };
  reliablePayers: ReliablePayerInsight[];
  unbilledRetainerOpportunities: UnbilledRetainerOpportunity[];
  cards: InsightCard[];
}

export interface NarrativeResult {
  summary: string;
  source: "openai" | "gemini" | "deterministic";
  model?: string;
}

export interface NarrativeOptions {
  // Explicit OpenAI apiKey forces the OpenAI path (back-compat + test seam).
  // When omitted, the provider is resolved automatically (Gemini first).
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value.valueOf?.() ?? 0) || 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return roundPercent(((current - previous) / previous) * 100);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function startOfUtcQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function inRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date < end;
}

function cashInFor(payments: CashFlowPaymentInput[], start: Date, end: Date): number {
  return roundMoney(
    payments
      .filter((p) => inRange(p.paidAt, start, end))
      .reduce((sum, p) => sum + toNumber(p.amount), 0),
  );
}

function cashOutFor(expenses: CashFlowExpenseInput[], start: Date, end: Date): number {
  return roundMoney(
    expenses
      .filter((e) => inRange(e.createdAt, start, end))
      .reduce((sum, e) => sum + toNumber(e.rate) * toNumber(e.qty), 0),
  );
}

function periodMetrics(
  payments: CashFlowPaymentInput[],
  expenses: CashFlowExpenseInput[],
  start: Date,
  end: Date,
) {
  const cashIn = cashInFor(payments, start, end);
  const cashOut = cashOutFor(expenses, start, end);
  return { cashIn, cashOut, netCash: roundMoney(cashIn - cashOut) };
}

function withChanges(
  current: ReturnType<typeof periodMetrics>,
  previous: ReturnType<typeof periodMetrics>,
): PeriodMetrics {
  return {
    ...current,
    cashInChangePercent: percentChange(current.cashIn, previous.cashIn),
    cashOutChangePercent: percentChange(current.cashOut, previous.cashOut),
    netCashChangePercent: percentChange(current.netCash, previous.netCash),
  };
}

function calculateOverdue(openInvoices: CashFlowOpenInvoiceInput[], now: Date) {
  let count = 0;
  let total = 0;
  for (const invoice of openInvoices) {
    const remaining = toNumber(invoice.total) - (invoice.payments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0);
    const isOverdue = invoice.status === "OVERDUE" || (!!invoice.dueDate && invoice.dueDate < now);
    if (isOverdue && remaining > 0) {
      count++;
      total += remaining;
    }
  }
  return { count, total: roundMoney(total) };
}

function calculateReliablePayers(payments: CashFlowPaymentInput[], now: Date): ReliablePayerInsight[] {
  const lookbackStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const byClient = new Map<string, { clientName: string; daysLate: number[] }>();

  for (const payment of payments) {
    const clientId = payment.invoice?.clientId;
    if (!clientId || !payment.invoice?.dueDate || payment.paidAt < lookbackStart) continue;
    const daysLate = Math.max(0, Math.round((payment.paidAt.getTime() - payment.invoice.dueDate.getTime()) / 86_400_000));
    const entry = byClient.get(clientId) ?? {
      clientName: payment.invoice.client?.name ?? "Unknown client",
      daysLate: [],
    };
    entry.daysLate.push(daysLate);
    byClient.set(clientId, entry);
  }

  return Array.from(byClient.entries())
    .map(([clientId, entry]) => ({
      clientId,
      clientName: entry.clientName,
      paymentsCount: entry.daysLate.length,
      averageDaysLate: roundPercent(entry.daysLate.reduce((sum, days) => sum + days, 0) / entry.daysLate.length),
    }))
    .filter((entry) => entry.paymentsCount >= 3 && entry.averageDaysLate <= 3)
    .sort((a, b) => b.paymentsCount - a.paymentsCount || a.averageDaysLate - b.averageDaysLate);
}

function calculateUnbilledRetainers(
  entries: CashFlowRetainerTimeEntryInput[],
  reliablePayers: ReliablePayerInsight[],
): UnbilledRetainerOpportunity[] {
  const reliableClientIds = new Set(reliablePayers.map((payer) => payer.clientId));
  const grouped = new Map<string, UnbilledRetainerOpportunity>();

  for (const entry of entries) {
    const clientId = entry.retainer?.clientId;
    if (!entry.retainerId || entry.invoiceLineId || !clientId || !reliableClientIds.has(clientId)) continue;
    const retainerName = entry.retainer?.name ?? "Hours retainer";
    const key = `${clientId}:${entry.retainerId}`;
    const hours = toNumber(entry.minutes) / 60;
    const hourlyRate = entry.retainer?.hourlyRate == null ? null : toNumber(entry.retainer.hourlyRate);
    const existing = grouped.get(key) ?? {
      clientId,
      clientName: entry.retainer?.client?.name ?? "Unknown client",
      retainerName,
      hours: 0,
      estimatedValue: hourlyRate === null ? null : 0,
    };
    existing.hours += hours;
    if (hourlyRate !== null) {
      existing.estimatedValue = roundMoney((existing.estimatedValue ?? 0) + hours * hourlyRate);
    }
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((entry) => ({ ...entry, hours: roundPercent(entry.hours) }))
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0));
}

function buildInsightCards(metrics: Omit<CashFlowInsightMetrics, "cards">): InsightCard[] {
  if (metrics.insufficientData) {
    return [
      {
        title: "Not enough cash-flow history yet",
        body: "Add paid invoices and expenses across at least two periods to unlock trend comparisons.",
        severity: "info",
      },
    ];
  }

  const cards: InsightCard[] = [];
  if (metrics.currentQuarter.cashInChangePercent !== null) {
    const change = metrics.currentQuarter.cashInChangePercent;
    cards.push({
      title: change >= 0 ? "Quarterly cash-in is up" : "Quarterly cash-in is down",
      body: `Cash collected this quarter is ${Math.abs(change)}% ${change >= 0 ? "above" : "below"} last quarter.`,
      severity: change >= 0 ? "success" : "warning",
      metric: `${change >= 0 ? "+" : ""}${change}%`,
    });
  }
  if (metrics.overdue.count > 0) {
    cards.push({
      title: "Overdue cash needs follow-up",
      body: `${metrics.overdue.count} overdue invoice${metrics.overdue.count === 1 ? "" : "s"} total $${metrics.overdue.total.toLocaleString("en-US")}.`,
      severity: "danger",
      metric: `$${metrics.overdue.total.toLocaleString("en-US")}`,
    });
  }
  if (metrics.unbilledRetainerOpportunities.length > 0) {
    const totalHours = roundPercent(metrics.unbilledRetainerOpportunities.reduce((sum, item) => sum + item.hours, 0));
    cards.push({
      title: "Reliable payers have unbilled retainer time",
      body: `${metrics.unbilledRetainerOpportunities.length} reliable payer${metrics.unbilledRetainerOpportunities.length === 1 ? "" : "s"} have ${totalHours} unbilled retainer hour${totalHours === 1 ? "" : "s"}.`,
      severity: "warning",
      metric: `${totalHours}h`,
    });
  }

  return cards.length > 0 ? cards : [
    {
      title: "Cash flow is steady",
      body: "No overdue, unbilled retainer, or period-over-period warning signals were found.",
      severity: "success",
    },
  ];
}

export function calculateCashFlowInsightMetrics(
  input: CashFlowInsightInput,
  now = new Date(),
): CashFlowInsightMetrics {
  const currentMonthStart = startOfUtcMonth(now);
  const previousMonthStart = addUtcMonths(currentMonthStart, -1);
  const previousMonthEnd = currentMonthStart;
  const nextMonthStart = addUtcMonths(currentMonthStart, 1);

  const currentQuarterStart = startOfUtcQuarter(now);
  const previousQuarterStart = addUtcMonths(currentQuarterStart, -3);
  const previousQuarterEnd = currentQuarterStart;
  const nextQuarterStart = addUtcMonths(currentQuarterStart, 3);

  const previousMonth = periodMetrics(input.payments, input.expenses, previousMonthStart, previousMonthEnd);
  const currentMonthBase = periodMetrics(input.payments, input.expenses, currentMonthStart, nextMonthStart);
  const previousQuarter = periodMetrics(input.payments, input.expenses, previousQuarterStart, previousQuarterEnd);
  const currentQuarterBase = periodMetrics(input.payments, input.expenses, currentQuarterStart, nextQuarterStart);

  const overdue = calculateOverdue(input.openInvoices, now);
  const reliablePayers = calculateReliablePayers(input.payments, now);
  const unbilledRetainerOpportunities = calculateUnbilledRetainers(input.retainerTimeEntries, reliablePayers);
  const insufficientData = input.payments.length + input.expenses.length < 2;

  const metricsWithoutCards = {
    generatedAt: now.toISOString(),
    insufficientData,
    assumptions: [
      "Cash-in uses payment paidAt dates.",
      "Cash-out uses expense createdAt dates and rate × quantity.",
      "Reliable payers are clients with at least 3 payments in the last 180 days averaging 3 or fewer days late.",
      "Retainer opportunities include unbilled time entries on retainers for reliable payers only; dollar value is an estimate when an hourly rate exists.",
    ],
    currentMonth: withChanges(currentMonthBase, previousMonth),
    previousMonth,
    currentQuarter: withChanges(currentQuarterBase, previousQuarter),
    previousQuarter,
    overdue,
    reliablePayers,
    unbilledRetainerOpportunities,
  } satisfies Omit<CashFlowInsightMetrics, "cards">;

  return {
    ...metricsWithoutCards,
    cards: buildInsightCards(metricsWithoutCards),
  };
}

export function buildCashFlowNarrativePrompt(metrics: CashFlowInsightMetrics): string {
  const sanitized = {
    generatedAt: metrics.generatedAt,
    insufficientData: metrics.insufficientData,
    currentMonth: metrics.currentMonth,
    currentQuarter: metrics.currentQuarter,
    previousQuarter: metrics.previousQuarter,
    overdue: metrics.overdue,
    reliablePayerCount: metrics.reliablePayers.length,
    unbilledRetainerOpportunityCount: metrics.unbilledRetainerOpportunities.length,
    unbilledRetainerHours: roundPercent(metrics.unbilledRetainerOpportunities.reduce((sum, item) => sum + item.hours, 0)),
    estimatedUnbilledRetainerValue: roundMoney(
      metrics.unbilledRetainerOpportunities.reduce((sum, item) => sum + (item.estimatedValue ?? 0), 0),
    ),
    assumptions: metrics.assumptions,
  };

  return `Write a concise cash-flow narrative for a small-business invoicing dashboard.
Use only these aggregate deterministic metrics; do not ask for or expose raw invoice details, client names, emails, or IDs.
Do not invent data. Clearly label estimates and assumptions. If insufficientData is true, say there is not enough history yet and suggest what data is needed.
Return 1-2 sentences, direct and actionable.

Metrics JSON:
${JSON.stringify(sanitized, null, 2)}`;
}

function deterministicNarrative(metrics: CashFlowInsightMetrics): string {
  if (metrics.insufficientData) {
    return "Not enough cash-flow history yet to generate a trend narrative. Add paid invoices and expenses across at least two periods to unlock comparisons.";
  }

  const parts: string[] = [];
  if (metrics.currentQuarter.cashInChangePercent !== null) {
    const change = metrics.currentQuarter.cashInChangePercent;
    parts.push(`You are trending ${Math.abs(change)}% ${change >= 0 ? "above" : "below"} last quarter on cash collected`);
  } else {
    parts.push("Cash collected has no comparable prior-quarter baseline yet");
  }
  if (metrics.overdue.count > 0) {
    parts.push(`${metrics.overdue.count} overdue invoice${metrics.overdue.count === 1 ? "" : "s"} total $${metrics.overdue.total.toLocaleString("en-US")}`);
  }
  if (metrics.unbilledRetainerOpportunities.length > 0) {
    const hours = roundPercent(metrics.unbilledRetainerOpportunities.reduce((sum, item) => sum + item.hours, 0));
    parts.push(`${metrics.unbilledRetainerOpportunities.length} reliable payer${metrics.unbilledRetainerOpportunities.length === 1 ? " has" : "s have"} ${hours} unbilled retainer hour${hours === 1 ? "" : "s"}`);
  }
  return `${parts.join("; ")}. Estimates are based on payment timing, open invoice balances, and retainer time entries currently available.`;
}

// Built-in Gemini model fallback chain for the narrative; override via
// GEMINI_CASHFLOW_MODELS. Mirrors the OCR / reminder / invoice-parser chains.
const GEMINI_NARRATIVE_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

function deterministicResult(metrics: CashFlowInsightMetrics): NarrativeResult {
  return { summary: deterministicNarrative(metrics), source: "deterministic" };
}

async function generateOpenAINarrative(
  metrics: CashFlowInsightMetrics,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch,
): Promise<NarrativeResult> {
  if (!apiKey) return deterministicResult(metrics);
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildCashFlowNarrativePrompt(metrics),
        temperature: 0.2,
        max_output_tokens: 140,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI response failed with ${response.status}`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text).find(Boolean);
    if (!text) throw new Error("OpenAI response did not include text");
    return { summary: text.trim(), source: "openai", model };
  } catch {
    return deterministicResult(metrics);
  }
}

async function generateGeminiNarrative(metrics: CashFlowInsightMetrics): Promise<NarrativeResult> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return deterministicResult(metrics);
  const models = resolveGeminiModels(env.GEMINI_CASHFLOW_MODELS, GEMINI_NARRATIVE_MODELS);
  return callGeminiWithModelFallback({
    apiKey,
    models,
    body: {
      contents: [{ role: "user", parts: [{ text: buildCashFlowNarrativePrompt(metrics) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 140 },
    },
    label: "cash-flow narrative",
    onOk: (json) => {
      const text = extractGeminiText(json);
      if (!text) throw new Error("Gemini narrative returned no text");
      return { summary: text.trim(), source: "gemini" as const, model: models[0] };
    },
  });
}

/**
 * Generate a 1-2 sentence cash-flow narrative. Provider precedence:
 *   1. An explicit OpenAI `apiKey` option (back-compat + test seam) → OpenAI.
 *   2. Otherwise Gemini first (running its 429 model-fallback chain),
 *   3. then OpenAI (env key), 4. then the deterministic fallback.
 */
export async function generateCashFlowNarrative(
  metrics: CashFlowInsightMetrics,
  options: NarrativeOptions = {},
): Promise<NarrativeResult> {
  if (metrics.insufficientData) return deterministicResult(metrics);

  const fetchImpl = options.fetchImpl ?? fetch;
  const openAIModel = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  // An explicitly-provided OpenAI key pins the OpenAI path.
  if (options.apiKey !== undefined) {
    return generateOpenAINarrative(metrics, options.apiKey, openAIModel, fetchImpl);
  }

  // Default: Gemini first, then OpenAI, then deterministic.
  if (env.GEMINI_API_KEY) {
    try {
      return await generateGeminiNarrative(metrics);
    } catch {
      // fall through to OpenAI / deterministic
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return generateOpenAINarrative(metrics, process.env.OPENAI_API_KEY, openAIModel, fetchImpl);
  }
  return deterministicResult(metrics);
}
