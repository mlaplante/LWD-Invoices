/**
 * Subscription / recurring-revenue metrics (MRR / ARR / churn).
 *
 * Between recurring invoices, flat retainers, and hours-retainers, an
 * invoicing business effectively runs a subscription book. This normalizes
 * every recurring revenue stream to a monthly value and derives MRR, ARR,
 * ARPA, net-new MRR, and revenue/logo churn over a trailing window.
 *
 * Pure function (`calculateSubscriptionMetrics`) so it's unit-testable; the
 * router maps recurring invoices + retainers into `RecurringRevenueStream[]`.
 */

export type RecurringStreamFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type RecurringStreamKind = "recurring_invoice" | "retainer" | "hours_retainer";

export interface RecurringRevenueStream {
  clientId: string;
  kind: RecurringStreamKind;
  /** Gross amount billed per occurrence (in org currency). */
  amount: number;
  frequency: RecurringStreamFrequency;
  interval: number;
  startDate: Date;
  /** End date when the stream is scheduled to stop, or null if open-ended. */
  endDate: Date | null;
  isActive: boolean;
}

export interface SubscriptionMetrics {
  generatedAt: string;
  periodDays: number;
  /** Active monthly recurring revenue. */
  mrr: number;
  /** Annual run rate (mrr * 12). */
  arr: number;
  /** Average revenue per active account. */
  arpa: number;
  activeCustomers: number;
  activeStreams: number;
  /** MRR added by streams that started within the period. */
  newMrr: number;
  /** MRR lost to streams that ended within the period. */
  churnedMrr: number;
  netNewMrr: number;
  mrrAtPeriodStart: number;
  /** Lost MRR / MRR at period start, as a percentage. */
  revenueChurnRatePercent: number;
  customersAtPeriodStart: number;
  churnedCustomers: number;
  /** Churned customers / customers at period start, as a percentage. */
  logoChurnRatePercent: number;
  /** MRR split by stream kind. */
  mrrByKind: Record<RecurringStreamKind, number>;
}

const WEEKS_PER_MONTH = 52 / 12;
const DAYS_PER_MONTH = 365 / 12;
const DAY_MS = 86_400_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Normalize a single occurrence amount to its monthly-recurring contribution. */
export function normalizeToMonthly(
  amount: number,
  frequency: RecurringStreamFrequency,
  interval: number,
): number {
  const step = Math.max(1, interval);
  switch (frequency) {
    case "DAILY":
      return (amount * DAYS_PER_MONTH) / step;
    case "WEEKLY":
      return (amount * WEEKS_PER_MONTH) / step;
    case "MONTHLY":
      return amount / step;
    case "YEARLY":
      return amount / (12 * step);
  }
}

function isActiveAt(stream: RecurringRevenueStream, at: Date): boolean {
  if (stream.startDate > at) return false;
  if (stream.endDate && stream.endDate <= at) return false;
  return true;
}

export function calculateSubscriptionMetrics(
  streams: RecurringRevenueStream[],
  options: { now?: Date; periodDays?: number } = {},
): SubscriptionMetrics {
  const now = options.now ?? new Date();
  const periodDays = options.periodDays ?? 30;
  const periodStart = new Date(now.getTime() - periodDays * DAY_MS);

  const monthly = streams.map((s) => ({
    stream: s,
    monthly: normalizeToMonthly(s.amount, s.frequency, s.interval),
  }));

  const mrrByKind: Record<RecurringStreamKind, number> = {
    recurring_invoice: 0,
    retainer: 0,
    hours_retainer: 0,
  };

  let mrr = 0;
  let newMrr = 0;
  let churnedMrr = 0;
  let mrrAtPeriodStart = 0;
  const activeClients = new Set<string>();
  const clientsAtStart = new Set<string>();
  const clientsActiveNow = new Set<string>();

  for (const { stream, monthly: m } of monthly) {
    const activeNow = stream.isActive && isActiveAt(stream, now);
    const activeAtStart = isActiveAt(stream, periodStart);

    if (activeNow) {
      mrr += m;
      mrrByKind[stream.kind] += m;
      activeClients.add(stream.clientId);
      clientsActiveNow.add(stream.clientId);
    }
    if (activeAtStart) {
      mrrAtPeriodStart += m;
      clientsAtStart.add(stream.clientId);
    }
    // New: started within the period and active now.
    if (activeNow && stream.startDate >= periodStart) {
      newMrr += m;
    }
    // Churned: was active at period start, no longer active now.
    if (activeAtStart && !activeNow) {
      churnedMrr += m;
    }
  }

  // A customer churned only if they had an active stream at period start and
  // have none active now.
  let churnedCustomers = 0;
  for (const clientId of clientsAtStart) {
    if (!clientsActiveNow.has(clientId)) churnedCustomers++;
  }

  const activeCustomers = activeClients.size;
  const customersAtPeriodStart = clientsAtStart.size;

  return {
    generatedAt: now.toISOString(),
    periodDays,
    mrr: round(mrr),
    arr: round(mrr * 12),
    arpa: activeCustomers > 0 ? round(mrr / activeCustomers) : 0,
    activeCustomers,
    activeStreams: monthly.filter(({ stream }) => stream.isActive && isActiveAt(stream, now)).length,
    newMrr: round(newMrr),
    churnedMrr: round(churnedMrr),
    netNewMrr: round(newMrr - churnedMrr),
    mrrAtPeriodStart: round(mrrAtPeriodStart),
    revenueChurnRatePercent: mrrAtPeriodStart > 0 ? round((churnedMrr / mrrAtPeriodStart) * 100) : 0,
    customersAtPeriodStart,
    churnedCustomers,
    logoChurnRatePercent:
      customersAtPeriodStart > 0 ? round((churnedCustomers / customersAtPeriodStart) * 100) : 0,
    mrrByKind: {
      recurring_invoice: round(mrrByKind.recurring_invoice),
      retainer: round(mrrByKind.retainer),
      hours_retainer: round(mrrByKind.hours_retainer),
    },
  };
}
