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
});
