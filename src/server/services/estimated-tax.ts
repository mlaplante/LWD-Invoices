import type { PrismaClient } from "@/generated/prisma";

/**
 * US self-employment estimated-tax helper. Cash basis, calendar-year filer.
 *
 * Net SE income = gross income (payments received) − deductible expenses −
 * mileage deduction. We recommend setting aside a flat percentage of that net
 * (the org's `estimatedTaxSetAsidePercent`, default 30%) and, as guidance only,
 * surface a self-employment-tax estimate (15.3% on 92.35% of net).
 *
 * This is a planning aid, not tax advice: the SE-tax line ignores the Social
 * Security wage-base cap and the deductible-half adjustment, and the set-aside
 * is a blunt reserve, not a computed liability.
 */

export const SE_TAX_RATE = 0.153;
export const SE_TAXABLE_FRACTION = 0.9235;

export type EstimatedTaxQuarter = {
  quarter: 1 | 2 | 3 | 4;
  label: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  grossIncome: number;
  deductibleExpenses: number;
  mileageDeduction: number;
  netIncome: number;
  recommendedSetAside: number;
  seTaxEstimate: number;
};

export type EstimatedTaxTotals = {
  grossIncome: number;
  deductibleExpenses: number;
  mileageDeduction: number;
  netIncome: number;
  recommendedSetAside: number;
  seTaxEstimate: number;
};

export type EstimatedTaxNextDue = {
  quarter: 1 | 2 | 3 | 4;
  label: string;
  dueDate: Date;
  recommendedSetAside: number;
  daysUntil: number;
};

export type EstimatedTaxSummary = {
  year: number;
  setAsidePercent: number;
  ytd: EstimatedTaxTotals;
  quarters: EstimatedTaxQuarter[];
  nextDue: EstimatedTaxNextDue | null;
};

/** A money-bearing row tagged with the date it counts toward. */
export type DatedAmount = { date: Date; amount: number };

const MS_PER_DAY = 86_400_000;

/**
 * The four IRS estimated-tax periods for a calendar-year filer, in UTC. Q4's
 * payment is due January 15 of the *following* year. All bounds are inclusive
 * of the period and the payment is due on `dueDate`.
 */
export function usEstimatedTaxQuarters(
  year: number,
): Array<{ quarter: 1 | 2 | 3 | 4; periodStart: Date; periodEnd: Date; dueDate: Date }> {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  const endOfDay = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  return [
    { quarter: 1, periodStart: utc(year, 0, 1), periodEnd: endOfDay(year, 2, 31), dueDate: utc(year, 3, 15) },
    { quarter: 2, periodStart: utc(year, 3, 1), periodEnd: endOfDay(year, 4, 31), dueDate: utc(year, 5, 15) },
    { quarter: 3, periodStart: utc(year, 5, 1), periodEnd: endOfDay(year, 7, 31), dueDate: utc(year, 8, 15) },
    { quarter: 4, periodStart: utc(year, 8, 1), periodEnd: endOfDay(year, 11, 31), dueDate: utc(year + 1, 0, 15) },
  ];
}

/** SE-tax guidance figure: 15.3% on 92.35% of net SE income (floored at 0). */
export function selfEmploymentTax(netIncome: number): number {
  if (netIncome <= 0) return 0;
  return netIncome * SE_TAXABLE_FRACTION * SE_TAX_RATE;
}

function bucketIndex(
  date: Date,
  quarters: ReturnType<typeof usEstimatedTaxQuarters>,
): number {
  const t = date.getTime();
  for (let i = 0; i < quarters.length; i++) {
    if (t >= quarters[i].periodStart.getTime() && t <= quarters[i].periodEnd.getTime()) {
      return i;
    }
  }
  return -1;
}

/**
 * Pure core: given dated income, deductible-expense, and mileage amounts for a
 * year, bucket them into quarters and compute the recommended set-aside.
 * Exported for unit testing without a database.
 */
export function buildEstimatedTaxSummary(args: {
  year: number;
  setAsidePercent: number;
  income: DatedAmount[];
  deductibleExpenses: DatedAmount[];
  mileageDeductions: DatedAmount[];
  now: Date;
}): EstimatedTaxSummary {
  const { year, setAsidePercent, income, deductibleExpenses, mileageDeductions, now } = args;
  const periods = usEstimatedTaxQuarters(year);
  const rate = setAsidePercent / 100;

  const gross = [0, 0, 0, 0];
  const ded = [0, 0, 0, 0];
  const miles = [0, 0, 0, 0];

  for (const r of income) {
    const i = bucketIndex(r.date, periods);
    if (i >= 0) gross[i] += r.amount;
  }
  for (const r of deductibleExpenses) {
    const i = bucketIndex(r.date, periods);
    if (i >= 0) ded[i] += r.amount;
  }
  for (const r of mileageDeductions) {
    const i = bucketIndex(r.date, periods);
    if (i >= 0) miles[i] += r.amount;
  }

  const quarters: EstimatedTaxQuarter[] = periods.map((p, i) => {
    const netIncome = gross[i] - ded[i] - miles[i];
    const positiveNet = Math.max(0, netIncome);
    return {
      quarter: p.quarter,
      label: `Q${p.quarter} ${year}`,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      dueDate: p.dueDate,
      grossIncome: gross[i],
      deductibleExpenses: ded[i],
      mileageDeduction: miles[i],
      netIncome,
      recommendedSetAside: positiveNet * rate,
      seTaxEstimate: selfEmploymentTax(positiveNet),
    };
  });

  const sum = (sel: (q: EstimatedTaxQuarter) => number) =>
    quarters.reduce((s, q) => s + sel(q), 0);
  const ytdNet = sum((q) => q.grossIncome) - sum((q) => q.deductibleExpenses) - sum((q) => q.mileageDeduction);
  const ytd: EstimatedTaxTotals = {
    grossIncome: sum((q) => q.grossIncome),
    deductibleExpenses: sum((q) => q.deductibleExpenses),
    mileageDeduction: sum((q) => q.mileageDeduction),
    netIncome: ytdNet,
    recommendedSetAside: Math.max(0, ytdNet) * rate,
    seTaxEstimate: selfEmploymentTax(Math.max(0, ytdNet)),
  };

  // Next due = the earliest quarter whose payment deadline hasn't passed.
  const nowT = now.getTime();
  const upcoming = quarters.find((q) => q.dueDate.getTime() >= nowT) ?? null;
  const nextDue: EstimatedTaxNextDue | null = upcoming
    ? {
        quarter: upcoming.quarter,
        label: upcoming.label,
        dueDate: upcoming.dueDate,
        recommendedSetAside: upcoming.recommendedSetAside,
        daysUntil: Math.max(0, Math.ceil((upcoming.dueDate.getTime() - nowT) / MS_PER_DAY)),
      }
    : null;

  return { year, setAsidePercent, ytd, quarters, nextDue };
}

/**
 * Fetch the year's payments, deductible expenses, and mileage and roll them up
 * into an estimated-tax summary. Income is cash basis (payment receipt date);
 * uncategorized expenses are excluded from deductions to match the tax
 * dashboard's conservative treatment.
 */
export async function getEstimatedTaxSummary(
  db: PrismaClient,
  orgId: string,
  opts: { year: number; setAsidePercent: number; now?: Date },
): Promise<EstimatedTaxSummary> {
  const { year, setAsidePercent } = opts;
  const now = opts.now ?? new Date();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const [payments, expenses, mileage] = await Promise.all([
    db.payment.findMany({
      where: { organizationId: orgId, paidAt: { gte: yearStart, lte: yearEnd } },
      select: { amount: true, paidAt: true },
    }),
    db.expense.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: yearStart, lte: yearEnd },
        // Only categorized, deductible expenses count — mirrors deductible-expenses.ts.
        category: { is: { deductible: true } },
      },
      select: { rate: true, qty: true, createdAt: true },
    }),
    db.mileageEntry.findMany({
      where: { organizationId: orgId, date: { gte: yearStart, lte: yearEnd } },
      select: { miles: true, ratePerMile: true, date: true },
    }),
  ]);

  return buildEstimatedTaxSummary({
    year,
    setAsidePercent,
    now,
    income: payments.map((p) => ({ date: p.paidAt, amount: Number(p.amount) })),
    deductibleExpenses: expenses.map((e) => ({
      date: e.createdAt,
      amount: Number(e.rate) * e.qty,
    })),
    mileageDeductions: mileage.map((m) => ({
      date: m.date,
      amount: Number(m.miles) * Number(m.ratePerMile),
    })),
  });
}

/**
 * Reminder gate: should we email an estimated-tax nudge today? Fires once when
 * `now` first enters the window [dueDate − reminderDays, dueDate] for any
 * upcoming due date, deduped via `lastSentAt`. Pure for testability.
 */
export function estimatedTaxReminderDue(args: {
  now: Date;
  dueDates: Date[];
  reminderDays: number;
  lastSentAt: Date | null;
}): { dueDate: Date } | null {
  const { now, dueDates, reminderDays, lastSentAt } = args;
  const nowT = now.getTime();
  for (const due of dueDates) {
    const windowStart = due.getTime() - reminderDays * MS_PER_DAY;
    if (nowT >= windowStart && nowT <= due.getTime()) {
      if (!lastSentAt || lastSentAt.getTime() < windowStart) {
        return { dueDate: due };
      }
    }
  }
  return null;
}
