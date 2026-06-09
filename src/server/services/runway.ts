/**
 * Runway / burn summary.
 *
 * A presentation layer over the cash-flow forecast that answers "how fast am I
 * burning cash, and where does my position trend?". Because the app stores no
 * bank balance, the headline is the net-position trajectory and monthly burn —
 * not a fabricated "days of cash". Days-of-cash is only computed when a starting
 * balance is supplied (an opt-in future enhancement), and stays null otherwise.
 *
 * Pure function (`deriveRunway`) so it's unit-testable; the router passes the
 * forecast input + the already-computed forecast.
 */

import type {
  CashFlowForecastInput,
  CashFlowForecast,
  ForecastFrequency,
} from "./cash-flow-forecast";

export interface RunwayNetPosition {
  horizonDays: number;
  projectedPosition: number;
  netChange: number;
}

export interface RunwayTrajectoryPoint {
  date: string;
  position: number;
}

export interface RunwaySummary {
  monthlyRecurringRevenue: number;
  monthlyRecurringExpense: number;
  /** Expense minus revenue. Positive = burning cash; negative = surplus. */
  monthlyBurn: number;
  netPositions: RunwayNetPosition[];
  /** Running cash position across the forecast horizon, for charting. */
  trajectory: RunwayTrajectoryPoint[];
  /** Days until a known starting balance runs out, or null when unknown/not burning. */
  daysOfCash: number | null;
  note: string;
}

const AVG_WEEKS_PER_MONTH = 52 / 12;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Normalize a recurring amount on any schedule to a monthly figure. */
function monthlyAmount(amount: number, frequency: ForecastFrequency, interval: number): number {
  const n = Math.max(1, interval);
  switch (frequency) {
    case "DAILY":
      return (amount * 30) / n;
    case "WEEKLY":
      return (amount * AVG_WEEKS_PER_MONTH) / n;
    case "MONTHLY":
      return amount / n;
    case "YEARLY":
      return amount / 12 / n;
  }
}

export function deriveRunway(
  input: CashFlowForecastInput,
  forecast: CashFlowForecast,
): RunwaySummary {
  const monthlyRecurringRevenue = round(
    input.recurringInvoices.reduce(
      (sum, r) => sum + monthlyAmount(r.amount, r.frequency, r.interval),
      0,
    ),
  );
  const monthlyRecurringExpense = round(
    input.recurringExpenses.reduce(
      (sum, e) => sum + monthlyAmount(e.amount, e.frequency, e.interval),
      0,
    ),
  );
  const monthlyBurn = round(monthlyRecurringExpense - monthlyRecurringRevenue);

  const netPositions: RunwayNetPosition[] = forecast.horizons.map((h) => ({
    horizonDays: h.horizonDays,
    projectedPosition: h.projectedPosition,
    netChange: h.netChange,
  }));

  // Running position across every forecast event, for a trajectory chart.
  const events = [
    ...forecast.inflows.map((e) => ({ date: e.date, delta: e.amount })),
    ...forecast.outflows.map((e) => ({ date: e.date, delta: -e.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const trajectory: RunwayTrajectoryPoint[] = [];
  let position = forecast.startingCash;
  for (const e of events) {
    position = round(position + e.delta);
    const last = trajectory[trajectory.length - 1];
    if (last && last.date === e.date) {
      last.position = position; // collapse same-day events into one point
    } else {
      trajectory.push({ date: e.date, position });
    }
  }

  // Days-of-cash only when we actually know a starting balance and are burning.
  const startingCash = input.startingCash ?? 0;
  const daysOfCash =
    startingCash > 0 && monthlyBurn > 0
      ? Math.round((startingCash / monthlyBurn) * 30)
      : null;

  const note =
    monthlyBurn > 0
      ? `Net −$${monthlyBurn.toLocaleString("en-US")}/mo at current burn.`
      : monthlyBurn < 0
        ? `Net +$${Math.abs(monthlyBurn).toLocaleString("en-US")}/mo surplus from recurring cash flow.`
        : "Recurring revenue and expenses are balanced.";

  return {
    monthlyRecurringRevenue,
    monthlyRecurringExpense,
    monthlyBurn,
    netPositions,
    trajectory,
    daysOfCash,
    note,
  };
}
