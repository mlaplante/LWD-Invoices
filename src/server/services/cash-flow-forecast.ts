/**
 * Forward cash-flow forecasting + scenario planning.
 *
 * Where cash-flow-insights.ts looks backward (trends on collected payments and
 * expenses), this projects forward: a 30/60/90-day cash position built from
 *   - open AR weighted by aging-based collection probability,
 *   - recurring invoices rolled forward by their schedule (autopay invoices
 *     collect with near-certainty shortly after issue),
 *   - recurring expenses as scheduled outflows.
 *
 * The projection math is a pure function (`projectCashFlow`) so it can be
 * unit-tested without a database; the router builds the inputs from Prisma
 * aggregates. `applyLatePaymentScenario` answers "what if Acme pays 30 days
 * late?" by shifting a client's expected collection dates before re-projecting.
 */

export type ForecastFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ForecastOpenInvoice {
  id: string;
  clientId: string;
  clientName: string;
  /** Outstanding balance (total minus payments already applied). */
  balance: number;
  /** Due date, or null for invoices with no due date (treated as due now). */
  dueDate: Date | null;
}

export interface ForecastRecurringInvoice {
  /** Expected invoice total per occurrence. */
  amount: number;
  /** True when the recurring invoice charges a card on file at issue time. */
  autoCharge: boolean;
  nextRunAt: Date;
  frequency: ForecastFrequency;
  interval: number;
  endDate: Date | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  /** Net payment terms in days when not autopay (defaults to 14). */
  paymentTermsDays?: number | null;
}

export interface ForecastRecurringExpense {
  amount: number;
  nextRunAt: Date;
  frequency: ForecastFrequency;
  interval: number;
  endDate: Date | null;
}

export interface CashFlowForecastInput {
  openInvoices: ForecastOpenInvoice[];
  recurringInvoices: ForecastRecurringInvoice[];
  recurringExpenses: ForecastRecurringExpense[];
  /** Known starting cash balance; the projection is reported relative to this. */
  startingCash?: number;
}

export interface ForecastInflowEvent {
  date: string; // ISO date
  amount: number; // probability-weighted expected amount
  grossAmount: number; // unweighted amount
  probability: number;
  source: "open_invoice" | "recurring_autopay" | "recurring_invoice";
  clientId?: string;
  label: string;
}

export interface ForecastOutflowEvent {
  date: string;
  amount: number;
  source: "recurring_expense";
  label: string;
}

export interface ForecastHorizon {
  horizonDays: number;
  /** Probability-weighted inflow expected within the horizon. */
  projectedInflow: number;
  projectedOutflow: number;
  netChange: number;
  /** startingCash + cumulative net change through this horizon. */
  projectedPosition: number;
  /** 0-1 blended confidence (weighted-average collection probability of the inflows). */
  confidence: number;
}

export interface CashFlowForecast {
  generatedAt: string;
  startingCash: number;
  horizons: ForecastHorizon[];
  assumptions: string[];
  /** Per-event detail, sorted by date, capped to the longest horizon. */
  inflows: ForecastInflowEvent[];
  outflows: ForecastOutflowEvent[];
}

export interface ProjectCashFlowOptions {
  now?: Date;
  horizons?: number[];
}

export interface LatePaymentScenario {
  clientId: string;
  clientName: string;
  delayDays: number;
}

export interface ContractorHireScenario {
  label?: string;
  /** Contractor rate per hour. */
  hourlyRate: number;
  /** Hours billed per recurrence period. */
  hoursPerPeriod: number;
  /** How often the contractor is paid. */
  frequency: ForecastFrequency;
  /** Period interval (default 1). */
  interval?: number;
  /** First payment date; defaults to now. */
  startDate?: Date | null;
}

export interface ChurnScenario {
  /** Percent reduction applied to recurring revenue (0–100). */
  churnPercent: number;
}

export interface ScenarioPlan {
  latePayments?: LatePaymentScenario[];
  contractorHire?: ContractorHireScenario | null;
  churn?: ChurnScenario | null;
}

const DEFAULT_HORIZONS = [30, 60, 90];
const DEFAULT_PAYMENT_TERMS_DAYS = 14;
const AUTOPAY_SETTLE_DAYS = 3;
const AUTOPAY_PROBABILITY = 0.97;
const RECURRING_INVOICE_PROBABILITY = 0.9;
const DAY_MS = 86_400_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Collection probability for an open invoice based on how overdue it is. */
export function collectionProbabilityForAging(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0.95;
  if (daysOverdue <= 30) return 0.9;
  if (daysOverdue <= 60) return 0.75;
  if (daysOverdue <= 90) return 0.55;
  return 0.35;
}

function advanceRecurring(date: Date, frequency: ForecastFrequency, interval: number): Date {
  const next = new Date(date);
  const step = Math.max(1, interval);
  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + step);
      break;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7 * step);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + step);
      break;
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + step);
      break;
  }
  return next;
}

function buildOpenInvoiceInflows(input: CashFlowForecastInput, now: Date): ForecastInflowEvent[] {
  return input.openInvoices
    .filter((inv) => inv.balance > 0)
    .map((inv) => {
      const due = inv.dueDate ?? now;
      const daysOverdue = Math.round((now.getTime() - due.getTime()) / DAY_MS);
      const probability = collectionProbabilityForAging(daysOverdue);
      // Not-yet-due invoices are expected on the due date; overdue ones are
      // assumed to land a short, aging-scaled stretch from now.
      const expectedDate =
        daysOverdue <= 0 ? due : addDays(now, Math.min(15 + Math.max(0, daysOverdue) / 3, 45));
      return {
        date: isoDate(expectedDate),
        amount: round(inv.balance * probability),
        grossAmount: round(inv.balance),
        probability,
        source: "open_invoice" as const,
        clientId: inv.clientId,
        label: `${inv.clientName} — open invoice`,
      };
    });
}

function buildRecurringInvoiceInflows(
  input: CashFlowForecastInput,
  now: Date,
  horizonEnd: Date,
): ForecastInflowEvent[] {
  const events: ForecastInflowEvent[] = [];
  for (const rec of input.recurringInvoices) {
    let runAt = new Date(rec.nextRunAt);
    let occurrence = rec.occurrenceCount;
    // Cap iterations defensively so a daily schedule can't loop unbounded.
    for (let guard = 0; guard < 400; guard++) {
      if (runAt > horizonEnd) break;
      if (rec.endDate && runAt > rec.endDate) break;
      if (rec.maxOccurrences != null && occurrence >= rec.maxOccurrences) break;
      if (runAt >= now) {
        const settleDate = rec.autoCharge
          ? addDays(runAt, AUTOPAY_SETTLE_DAYS)
          : addDays(runAt, rec.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS);
        const probability = rec.autoCharge ? AUTOPAY_PROBABILITY : RECURRING_INVOICE_PROBABILITY;
        events.push({
          date: isoDate(settleDate),
          amount: round(rec.amount * probability),
          grossAmount: round(rec.amount),
          probability,
          source: rec.autoCharge ? "recurring_autopay" : "recurring_invoice",
          label: rec.autoCharge ? "Recurring invoice (autopay)" : "Recurring invoice",
        });
      }
      occurrence++;
      runAt = advanceRecurring(runAt, rec.frequency, rec.interval);
    }
  }
  return events;
}

function buildRecurringExpenseOutflows(
  input: CashFlowForecastInput,
  now: Date,
  horizonEnd: Date,
): ForecastOutflowEvent[] {
  const events: ForecastOutflowEvent[] = [];
  for (const exp of input.recurringExpenses) {
    let runAt = new Date(exp.nextRunAt);
    for (let guard = 0; guard < 400; guard++) {
      if (runAt > horizonEnd) break;
      if (exp.endDate && runAt > exp.endDate) break;
      if (runAt >= now) {
        events.push({
          date: isoDate(runAt),
          amount: round(exp.amount),
          source: "recurring_expense",
          label: "Recurring expense",
        });
      }
      runAt = advanceRecurring(runAt, exp.frequency, exp.interval);
    }
  }
  return events;
}

export function projectCashFlow(
  input: CashFlowForecastInput,
  options: ProjectCashFlowOptions = {},
): CashFlowForecast {
  const now = options.now ?? new Date();
  const horizons = (options.horizons ?? DEFAULT_HORIZONS).slice().sort((a, b) => a - b);
  const startingCash = input.startingCash ?? 0;
  const maxHorizon = horizons[horizons.length - 1] ?? 90;
  const horizonEnd = addDays(now, maxHorizon);

  const inflows = [
    ...buildOpenInvoiceInflows(input, now),
    ...buildRecurringInvoiceInflows(input, now, horizonEnd),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const outflows = buildRecurringExpenseOutflows(input, now, horizonEnd).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const horizonResults = horizons.map((horizonDays) => {
    const cutoff = isoDate(addDays(now, horizonDays));
    const inWindow = inflows.filter((e) => e.date <= cutoff);
    const projectedInflow = round(inWindow.reduce((sum, e) => sum + e.amount, 0));
    const projectedOutflow = round(
      outflows.filter((e) => e.date <= cutoff).reduce((sum, e) => sum + e.amount, 0),
    );
    const grossInWindow = inWindow.reduce((sum, e) => sum + e.grossAmount, 0);
    const confidence = grossInWindow > 0 ? round(projectedInflow / grossInWindow) : 1;
    const netChange = round(projectedInflow - projectedOutflow);
    return {
      horizonDays,
      projectedInflow,
      projectedOutflow,
      netChange,
      projectedPosition: round(startingCash + netChange),
      confidence,
    };
  });

  return {
    generatedAt: now.toISOString(),
    startingCash: round(startingCash),
    horizons: horizonResults,
    assumptions: [
      "Open invoices are weighted by aging: 0.95 if not yet due, down to 0.35 once 90+ days overdue.",
      "Autopay recurring invoices are assumed to settle ~3 days after issue at 0.97 probability.",
      "Non-autopay recurring invoices settle after net terms (default 14 days) at 0.90 probability.",
      "Recurring expenses are projected at full value on their scheduled run dates.",
      "Projected position = starting cash + cumulative probability-weighted net change.",
    ],
    inflows,
    outflows,
  };
}

// ── Scenario input transforms ────────────────────────────────────────────────
// Each returns a modified CashFlowForecastInput so scenarios compose; the
// public apply* helpers project the transformed input.

function withLatePayments(
  input: CashFlowForecastInput,
  scenarios: LatePaymentScenario[],
  now: Date,
): CashFlowForecastInput {
  const delayByClient = new Map(scenarios.map((s) => [s.clientId, s.delayDays]));
  const adjustedOpen = input.openInvoices.map((inv) => {
    const delay = delayByClient.get(inv.clientId);
    if (!delay) return inv;
    const due = inv.dueDate ?? now;
    return { ...inv, dueDate: addDays(due, delay) };
  });
  return { ...input, openInvoices: adjustedOpen };
}

function withContractorHire(
  input: CashFlowForecastInput,
  scenario: ContractorHireScenario,
  now: Date,
): CashFlowForecastInput {
  const interval = scenario.interval ?? 1;
  // Contractors are paid in arrears: the first payment lands one period after
  // the hire date, not immediately. This also avoids a boundary artifact where
  // a payment at day 0 and another at the horizon edge would both count.
  const nextRunAt = scenario.startDate ?? advanceRecurring(now, scenario.frequency, interval);
  const hire: ForecastRecurringExpense = {
    amount: scenario.hourlyRate * scenario.hoursPerPeriod,
    nextRunAt,
    frequency: scenario.frequency,
    interval,
    endDate: null,
  };
  return { ...input, recurringExpenses: [...input.recurringExpenses, hire] };
}

function withChurn(
  input: CashFlowForecastInput,
  scenario: ChurnScenario,
): CashFlowForecastInput {
  const factor = Math.max(0, 1 - scenario.churnPercent / 100);
  const churned = input.recurringInvoices.map((rec) => ({
    ...rec,
    amount: rec.amount * factor,
  }));
  return { ...input, recurringInvoices: churned };
}

/**
 * Re-project after delaying one or more clients' expected open-invoice
 * collections by a number of days. Recurring inflows/outflows are unaffected;
 * only the targeted clients' open-invoice events shift later.
 */
export function applyLatePaymentScenario(
  input: CashFlowForecastInput,
  scenarios: LatePaymentScenario[],
  options: ProjectCashFlowOptions = {},
): CashFlowForecast {
  const now = options.now ?? new Date();
  return projectCashFlow(withLatePayments(input, scenarios, now), options);
}

/**
 * Re-project after hiring a contractor: adds a recurring outflow of
 * `hourlyRate × hoursPerPeriod` on the chosen schedule. Answers
 * "what if I hire a contractor at $85/hr?".
 */
export function applyContractorHireScenario(
  input: CashFlowForecastInput,
  scenario: ContractorHireScenario,
  options: ProjectCashFlowOptions = {},
): CashFlowForecast {
  const now = options.now ?? new Date();
  return projectCashFlow(withContractorHire(input, scenario, now), options);
}

/**
 * Re-project after recurring revenue churns: scales every recurring invoice's
 * amount down by the churn percentage. Answers
 * "what if recurring revenue churns by 10%?".
 */
export function applyChurnScenario(
  input: CashFlowForecastInput,
  scenario: ChurnScenario,
  options: ProjectCashFlowOptions = {},
): CashFlowForecast {
  return projectCashFlow(withChurn(input, scenario), options);
}

/**
 * Apply any combination of scenarios in a single projection so the UI can model
 * compound what-ifs (e.g. a key client pays late *and* a contractor is hired
 * *and* recurring revenue churns). An empty plan reproduces the baseline.
 */
export function applyScenarioPlan(
  input: CashFlowForecastInput,
  plan: ScenarioPlan,
  options: ProjectCashFlowOptions = {},
): CashFlowForecast {
  const now = options.now ?? new Date();
  let next = input;
  if (plan.latePayments && plan.latePayments.length > 0) {
    next = withLatePayments(next, plan.latePayments, now);
  }
  if (plan.contractorHire) next = withContractorHire(next, plan.contractorHire, now);
  if (plan.churn) next = withChurn(next, plan.churn);
  return projectCashFlow(next, options);
}
