import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { resolvePeriodLabel, defaultPeriodBounds } from "@/server/services/hours-retainers";

export const hoursRetainersRouter = router({
  list: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.hoursRetainer.findMany({
        where: { organizationId: ctx.orgId, clientId: input.clientId },
        include: {
          periods: {
            orderBy: { periodStart: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const retainer = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          client: { select: { id: true, name: true } },
          periods: { orderBy: { periodStart: "desc" } },
          timeEntries: {
            orderBy: { date: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });
      if (!retainer) throw new TRPCError({ code: "NOT_FOUND" });
      return retainer;
    }),

  create: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        clientId: z.string(),
        name: z.string().min(1),
        type: z.enum(["MONTHLY", "BLOCK"]),
        includedHours: z.number().positive(),
        hourlyRate: z.number().positive().optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      return ctx.db.$transaction(async (tx: any) => {
        const retainer = await tx.hoursRetainer.create({
          data: {
            organizationId: ctx.orgId,
            clientId: input.clientId,
            name: input.name,
            includedHours: input.includedHours,
            hourlyRate: input.hourlyRate,
            active: input.active,
            resetInterval: input.type === "MONTHLY" ? "MONTHLY" : null,
          },
        });

        if (input.type === "MONTHLY") {
          const now = new Date();
          const bounds = defaultPeriodBounds(now);
          await tx.hoursRetainerPeriod.create({
            data: {
              retainerId: retainer.id,
              label: resolvePeriodLabel(now),
              periodStart: bounds.start,
              periodEnd: bounds.end,
              includedHoursSnapshot: input.includedHours,
              status: "ACTIVE",
            },
          });
        }

        return retainer;
      });
    }),

  update: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        includedHours: z.number().positive().optional(),
        hourlyRate: z.number().positive().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.hoursRetainer.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.includedHours !== undefined && { includedHours: input.includedHours }),
          ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
          ...(input.active !== undefined && { active: input.active }),
        },
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const retainer = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!retainer) throw new TRPCError({ code: "NOT_FOUND" });

      const teCount = await ctx.db.timeEntry.count({ where: { retainerId: input.id } });
      if (teCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete: this retainer has time entries. Deactivate it instead, or detach entries first.",
        });
      }

      await ctx.db.hoursRetainer.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  openPeriod: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        retainerId: z.string(),
        label: z.string().optional(),
        periodStart: z.coerce.date().optional(),
        periodEnd: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const retainer = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.retainerId, organizationId: ctx.orgId },
      });
      if (!retainer) throw new TRPCError({ code: "NOT_FOUND" });
      if (retainer.resetInterval !== "MONTHLY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot open a period on a block retainer.",
        });
      }

      const anchor = input.periodStart ?? new Date();
      const bounds = defaultPeriodBounds(anchor);

      return ctx.db.hoursRetainerPeriod.create({
        data: {
          retainerId: retainer.id,
          label: input.label ?? resolvePeriodLabel(anchor),
          periodStart: input.periodStart ?? bounds.start,
          periodEnd: input.periodEnd ?? bounds.end,
          includedHoursSnapshot: retainer.includedHours,
          status: "ACTIVE",
        },
      });
    }),

  closeAndRoll: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ retainerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const retainer = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.retainerId, organizationId: ctx.orgId },
      });
      if (!retainer) throw new TRPCError({ code: "NOT_FOUND" });
      if (retainer.resetInterval !== "MONTHLY") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a monthly retainer." });
      }

      return ctx.db.$transaction(async (tx: any) => {
        const active = await tx.hoursRetainerPeriod.findFirst({
          where: { retainerId: retainer.id, status: "ACTIVE" },
        });
        if (!active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active period to close." });
        }
        const closed = await tx.hoursRetainerPeriod.update({
          where: { id: active.id },
          data: { status: "CLOSED" },
        });
        const nextStart = new Date(closed.periodEnd);
        nextStart.setUTCDate(nextStart.getUTCDate() + 1);
        const bounds = defaultPeriodBounds(nextStart);
        const opened = await tx.hoursRetainerPeriod.create({
          data: {
            retainerId: retainer.id,
            label: resolvePeriodLabel(nextStart),
            periodStart: bounds.start,
            periodEnd: bounds.end,
            includedHoursSnapshot: retainer.includedHours,
            status: "ACTIVE",
          },
        });
        return { closed, opened };
      });
    }),

  editPeriod: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        periodId: z.string(),
        label: z.string().min(1).optional(),
        periodStart: z.coerce.date().optional(),
        periodEnd: z.coerce.date().optional(),
        includedHoursSnapshot: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const period = await ctx.db.hoursRetainerPeriod.findFirst({
        where: { id: input.periodId, retainer: { organizationId: ctx.orgId } },
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.hoursRetainerPeriod.update({
        where: { id: input.periodId },
        data: {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
          ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
          ...(input.includedHoursSnapshot !== undefined && {
            includedHoursSnapshot: input.includedHoursSnapshot,
          }),
        },
      });
    }),

  deletePeriod: requireRole("OWNER", "ADMIN")
    .input(z.object({ periodId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const period = await ctx.db.hoursRetainerPeriod.findFirst({
        where: { id: input.periodId, retainer: { organizationId: ctx.orgId } },
        select: { id: true },
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND" });
      const teCount = await ctx.db.timeEntry.count({ where: { retainerPeriodId: input.periodId } });
      if (teCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete: this period has time entries.",
        });
      }
      await ctx.db.hoursRetainerPeriod.delete({ where: { id: input.periodId } });
      return { ok: true };
    }),
});
