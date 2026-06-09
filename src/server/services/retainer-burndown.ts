/**
 * Retainer burn-down.
 *
 * Pure projection math for both retainer types — `HoursRetainer` (hours used in
 * a period) and the prepaid money `Retainer` — so it can be unit-tested without
 * a database. The routers build the inputs from Prisma aggregates and feed them
 * in, mirroring the split in client-health-score.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_THRESHOLD = 0.8;

export type RetainerKind = "hours" | "money";

export interface HoursRetainerBurndownInput {
  retainerId: string;
  retainerName: string;
  clientId: string;
  clientName: string;
  periodId: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  includedHours: number;
  usedHours: number;
}

export interface MoneyRetainerBurndownInput {
  retainerId: string;
  clientId: string;
  clientName: string;
  balance: number;
  totalDeposits: number;
  totalDrawdowns: number;
  /** Drawdowns within the trailing window (for the run-rate). */
  windowDrawdowns: number;
  windowDays: number;
}

export interface RetainerBurndown {
  retainerId: string;
  kind: RetainerKind;
  clientId: string;
  clientName: string;
  label: string;
  unit: "hours" | "currency";
  /** Included hours OR total deposits. */
  total: number;
  /** Used hours OR total drawdowns. */
  used: number;
  /** Remaining hours OR remaining balance. */
  remaining: number;
  /** 0..1. */
  pctUsed: number;
  /** Hours/day or currency/day. */
  runRatePerDay: number;
  /** ISO "YYYY-MM-DD", or null when run-rate is 0 / already depleted. */
  projectedDepletionDate: string | null;
  warning: boolean;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function projectDepletion(remaining: number, runRatePerDay: number, now: Date): string | null {
  if (runRatePerDay <= 0 || remaining <= 0) return null;
  const daysLeft = remaining / runRatePerDay;
  return isoDate(new Date(now.getTime() + daysLeft * DAY_MS));
}

export function computeHoursBurndown(input: HoursRetainerBurndownInput, now: Date): RetainerBurndown {
  const remaining = round(input.includedHours - input.usedHours);
  const pctUsed = input.includedHours > 0 ? input.usedHours / input.includedHours : 0;
  const elapsedDays = Math.max((now.getTime() - input.periodStart.getTime()) / DAY_MS, 0);
  const runRatePerDay = elapsedDays > 0 ? input.usedHours / elapsedDays : 0;
  return {
    retainerId: input.retainerId,
    kind: "hours",
    clientId: input.clientId,
    clientName: input.clientName,
    label: input.retainerName,
    unit: "hours",
    total: round(input.includedHours),
    used: round(input.usedHours),
    remaining,
    pctUsed: round(pctUsed),
    runRatePerDay: round(runRatePerDay),
    projectedDepletionDate: projectDepletion(remaining, runRatePerDay, now),
    warning: pctUsed >= WARN_THRESHOLD,
  };
}

export function computeMoneyBurndown(input: MoneyRetainerBurndownInput, now: Date): RetainerBurndown {
  const pctUsed = input.totalDeposits > 0 ? input.totalDrawdowns / input.totalDeposits : 0;
  const runRatePerDay = input.windowDays > 0 ? input.windowDrawdowns / input.windowDays : 0;
  return {
    retainerId: input.retainerId,
    kind: "money",
    clientId: input.clientId,
    clientName: input.clientName,
    label: "Prepaid retainer",
    unit: "currency",
    total: round(input.totalDeposits),
    used: round(input.totalDrawdowns),
    remaining: round(input.balance),
    pctUsed: round(pctUsed),
    runRatePerDay: round(runRatePerDay),
    projectedDepletionDate: projectDepletion(input.balance, runRatePerDay, now),
    warning: pctUsed >= WARN_THRESHOLD,
  };
}
