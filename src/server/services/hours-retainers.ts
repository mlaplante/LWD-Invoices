import { Prisma } from "@/generated/prisma";

type MinuteBearing = { minutes: Prisma.Decimal };

export function calculateUsedHours(entries: MinuteBearing[]): Prisma.Decimal {
  const totalMinutes = entries.reduce(
    (sum, e) => sum.add(e.minutes),
    new Prisma.Decimal(0),
  );
  return totalMinutes.div(60);
}
