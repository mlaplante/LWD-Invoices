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
