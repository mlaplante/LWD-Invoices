import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import { logAudit } from "../services/audit";

const mileageInclude = {
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
} as const;

function entryLabel(entry: { miles: unknown; date: Date }): string {
  return `${Number(entry.miles)} mi on ${entry.date.toISOString().slice(0, 10)}`;
}

export const mileageRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.mileageEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
        include: mileageInclude,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | null = null;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id ?? null;
      }

      return { items, nextCursor };
    }),

  // Headline numbers for the mileage page: month-to-date and year-to-date
  // miles plus their deduction value at each entry's snapshotted rate.
  summary: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [entries, org] = await Promise.all([
      ctx.db.mileageEntry.findMany({
        where: { organizationId: ctx.orgId, date: { gte: yearStart } },
        select: { miles: true, ratePerMile: true, roundTrip: true, date: true },
      }),
      ctx.db.organization.findUnique({
        where: { id: ctx.orgId },
        select: { mileageRatePerMile: true },
      }),
    ]);

    let ytdMiles = 0;
    let ytdDeduction = 0;
    let monthMiles = 0;
    let monthDeduction = 0;
    for (const e of entries) {
      const miles = Number(e.miles) * (e.roundTrip ? 2 : 1);
      const deduction = miles * Number(e.ratePerMile);
      ytdMiles += miles;
      ytdDeduction += deduction;
      if (e.date >= monthStart) {
        monthMiles += miles;
        monthDeduction += deduction;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      ytdMiles: round2(ytdMiles),
      ytdDeduction: round2(ytdDeduction),
      monthMiles: round2(monthMiles),
      monthDeduction: round2(monthDeduction),
      currentRate: Number(org?.mileageRatePerMile ?? 0.7),
    };
  }),

  create: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        date: z.coerce.date(),
        miles: z.number().positive().max(100_000),
        // Per-entry override; defaults to the org's current rate.
        ratePerMile: z.number().min(0).max(1_000).optional(),
        description: z.string().max(500).optional(),
        fromLocation: z.string().max(200).optional(),
        toLocation: z.string().max(200).optional(),
        roundTrip: z.boolean().default(false),
        billable: z.boolean().default(false),
        projectId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ratePerMile, ...rest } = input;
      let rate = ratePerMile;
      if (rate === undefined) {
        const org = await ctx.db.organization.findUnique({
          where: { id: ctx.orgId },
          select: { mileageRatePerMile: true },
        });
        rate = Number(org?.mileageRatePerMile ?? 0.7);
      }
      const created = await ctx.db.mileageEntry.create({
        data: { ...rest, ratePerMile: rate, organizationId: ctx.orgId },
        include: mileageInclude,
      });
      await logAudit({
        action: "CREATED",
        entityType: "MileageEntry",
        entityId: created.id,
        entityLabel: entryLabel(created),
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return created;
    }),

  update: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        id: z.string(),
        date: z.coerce.date().optional(),
        miles: z.number().positive().max(100_000).optional(),
        ratePerMile: z.number().min(0).max(1_000).optional(),
        description: z.string().max(500).nullable().optional(),
        fromLocation: z.string().max(200).nullable().optional(),
        toLocation: z.string().max(200).nullable().optional(),
        roundTrip: z.boolean().optional(),
        billable: z.boolean().optional(),
        projectId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.mileageEntry.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.mileageEntry.update({
        where: { id, organizationId: ctx.orgId },
        data,
        include: mileageInclude,
      });
      await logAudit({
        action: "UPDATED",
        entityType: "MileageEntry",
        entityId: updated.id,
        entityLabel: entryLabel(updated),
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
    }),

  delete: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.mileageEntry.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const deleted = await ctx.db.mileageEntry.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      await logAudit({
        action: "DELETED",
        entityType: "MileageEntry",
        entityId: deleted.id,
        entityLabel: entryLabel(deleted),
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return deleted;
    }),

  // The org-wide default rate lives on Organization; editing it here keeps
  // the whole feature self-contained on the mileage page.
  updateRate: requireRole("OWNER", "ADMIN")
    .input(z.object({ ratePerMile: z.number().min(0).max(1_000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: { mileageRatePerMile: input.ratePerMile },
      });
      return { ratePerMile: input.ratePerMile };
    }),
});
