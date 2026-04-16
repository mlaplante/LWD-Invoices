import { Prisma } from "@/generated/prisma";

type MinuteBearing = { minutes: Prisma.Decimal };

export function calculateUsedHours(entries: MinuteBearing[]): Prisma.Decimal {
  const totalMinutes = entries.reduce(
    (sum, e) => sum.add(e.minutes),
    new Prisma.Decimal(0),
  );
  return totalMinutes.div(60);
}

export function calculateRemaining(
  included: Prisma.Decimal,
  used: Prisma.Decimal,
): { remaining: Prisma.Decimal; overBy: Prisma.Decimal | null } {
  const diff = included.sub(used);
  if (diff.lt(0)) {
    return { remaining: new Prisma.Decimal(0), overBy: diff.abs() };
  }
  return { remaining: diff, overBy: null };
}

export function isPeriodCurrent(
  period: { periodStart: Date; periodEnd: Date },
  now: Date,
): boolean {
  return now.getTime() >= period.periodStart.getTime()
    && now.getTime() <= period.periodEnd.getTime();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Returns "Month YYYY" using UTC month/year.
 * Precondition: `date` should be UTC-normalized (e.g., from the DB or an ISO string).
 * Locally-constructed Dates (new Date(2026, 1, 28)) may yield the wrong month in non-UTC timezones.
 */
export function resolvePeriodLabel(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Returns the first and last instant of the UTC month containing `date`.
 * Precondition: `date` should be UTC-normalized (e.g., from the DB or an ISO string).
 * Locally-constructed Dates (new Date(2026, 1, 28)) may yield the wrong month in non-UTC timezones.
 */
export function defaultPeriodBounds(date: Date): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1) - 1);
  return { start, end };
}

export function sanitizeTimeEntryForPortal(entry: {
  date: Date;
  minutes: Prisma.Decimal;
}): { date: Date; hours: Prisma.Decimal } {
  return { date: entry.date, hours: entry.minutes.div(60) };
}
