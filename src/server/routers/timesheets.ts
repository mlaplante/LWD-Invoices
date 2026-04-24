import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { roundMinutes } from "../services/time-rounding";

export const timesheetsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        userId: z.string().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: { taskTimeInterval: true },
      });
      const interval = org?.taskTimeInterval ?? 0;

      const entries = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.dateFrom || input.dateTo
            ? {
                date: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo ? { lte: input.dateTo } : {}),
                },
              }
            : {}),
        },
        include: {
          task: { select: { id: true, name: true } },
          project: {
            select: {
              id: true,
              name: true,
              rate: true,
              currency: {
                select: { symbol: true, symbolPosition: true },
              },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      return entries.map((e) => ({
        ...e,
        rawMinutes: e.minutes.toNumber(),
        roundedMinutes: roundMinutes(e.minutes.toNumber(), interval),
      }));
    }),

  summary: protectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["project", "user"]).default("project"),
        projectId: z.string().optional(),
        userId: z.string().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: { taskTimeInterval: true },
      });
      const interval = org?.taskTimeInterval ?? 0;

      const entries = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.dateFrom || input.dateTo
            ? {
                date: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo ? { lte: input.dateTo } : {}),
                },
              }
            : {}),
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              rate: true,
              currency: { select: { symbol: true, symbolPosition: true } },
            },
          },
        },
      });

      const groups = new Map<
        string,
        { key: string; label: string; totalMinutes: number; roundedMinutes: number; billableAmount: number }
      >();

      for (const entry of entries) {
        if (!entry.projectId || !entry.project) continue;
        const key = input.groupBy === "project" ? entry.projectId : entry.userId;
        const label = input.groupBy === "project" ? entry.project.name : entry.userId;

        const existing = groups.get(key) ?? {
          key,
          label,
          totalMinutes: 0,
          roundedMinutes: 0,
          billableAmount: 0,
        };

        const raw = entry.minutes.toNumber();
        const rounded = roundMinutes(raw, interval);
        const rate = entry.project.rate.toNumber();

        existing.totalMinutes += raw;
        existing.roundedMinutes += rounded;
        existing.billableAmount += (rounded / 60) * rate;

        groups.set(key, existing);
      }

      return Array.from(groups.values());
    }),
});
