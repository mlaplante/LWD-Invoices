import type { Prisma, PrismaClient } from "@/generated/prisma";
import {
  calculateUsedHours,
  calculateRemaining,
  sanitizeTimeEntryForPortal,
} from "./hours-retainers";

export type PortalRetainer = {
  id: string;
  name: string;
  type: "MONTHLY" | "BLOCK";
  includedHours: Prisma.Decimal;
  usedHours: Prisma.Decimal;
  remainingHours: Prisma.Decimal;
  overByHours: Prisma.Decimal | null;
  activePeriod: {
    id: string;
    label: string;
    periodStart: Date;
    periodEnd: Date;
    includedHoursSnapshot: Prisma.Decimal;
    usedHours: Prisma.Decimal;
    remainingHours: Prisma.Decimal;
    overByHours: Prisma.Decimal | null;
  } | null;
  previousPeriods: Array<{
    id: string;
    label: string;
    includedHoursSnapshot: Prisma.Decimal;
    usedHours: Prisma.Decimal;
  }>;
  workLog: Array<{ date: Date; hours: Prisma.Decimal }>;
};

export async function listPortalRetainers(
  db: PrismaClient,
  clientId: string,
): Promise<PortalRetainer[]> {
  const retainers = await db.hoursRetainer.findMany({
    where: { clientId, active: true },
    include: {
      periods: { orderBy: { periodStart: "desc" } },
      timeEntries: { orderBy: { date: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return retainers.map((r) => {
    const isMonthly = r.resetInterval === "MONTHLY";
    const activePeriodRaw = r.periods.find((p) => p.status === "ACTIVE") ?? null;

    const scopedEntries =
      isMonthly && activePeriodRaw
        ? r.timeEntries.filter((e) => e.retainerPeriodId === activePeriodRaw.id)
        : r.timeEntries;

    const usedHours = calculateUsedHours(scopedEntries);
    const { remaining, overBy } = calculateRemaining(r.includedHours, usedHours);

    let activePeriod: PortalRetainer["activePeriod"] = null;
    if (isMonthly && activePeriodRaw) {
      const periodEntries = r.timeEntries.filter(
        (e) => e.retainerPeriodId === activePeriodRaw.id,
      );
      const used = calculateUsedHours(periodEntries);
      const { remaining: rem, overBy: over } = calculateRemaining(
        activePeriodRaw.includedHoursSnapshot,
        used,
      );
      activePeriod = {
        id: activePeriodRaw.id,
        label: activePeriodRaw.label,
        periodStart: activePeriodRaw.periodStart,
        periodEnd: activePeriodRaw.periodEnd,
        includedHoursSnapshot: activePeriodRaw.includedHoursSnapshot,
        usedHours: used,
        remainingHours: rem,
        overByHours: over,
      };
    }

    const previousPeriods = isMonthly
      ? r.periods
          .filter((p) => p.status === "CLOSED")
          .slice(0, 3)
          .map((p) => {
            const entries = r.timeEntries.filter((e) => e.retainerPeriodId === p.id);
            return {
              id: p.id,
              label: p.label,
              includedHoursSnapshot: p.includedHoursSnapshot,
              usedHours: calculateUsedHours(entries),
            };
          })
      : [];

    const workLog = scopedEntries.map(sanitizeTimeEntryForPortal);

    return {
      id: r.id,
      name: r.name,
      type: isMonthly ? "MONTHLY" : "BLOCK",
      includedHours: r.includedHours,
      usedHours,
      remainingHours: remaining,
      overByHours: overBy,
      activePeriod,
      previousPeriods,
      workLog,
    };
  });
}
