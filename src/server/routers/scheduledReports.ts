import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";

export const scheduledReportsRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .query(async ({ ctx }) => {
      return ctx.db.scheduledReport.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        reportType: z.enum(["PROFIT_LOSS", "AGING", "UNPAID", "EXPENSES", "TAX_LIABILITY"]),
        frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]),
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        recipients: z.array(z.string().email()).min(1).max(10),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate frequency-specific fields
      if (input.frequency === "WEEKLY" && (input.dayOfWeek === undefined || input.dayOfWeek === null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "dayOfWeek is required for WEEKLY frequency" });
      }
      if ((input.frequency === "MONTHLY" || input.frequency === "QUARTERLY") &&
          (input.dayOfMonth === undefined || input.dayOfMonth === null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "dayOfMonth is required for MONTHLY/QUARTERLY frequency" });
      }

      return ctx.db.scheduledReport.create({
        data: {
          reportType: input.reportType,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek ?? null,
          dayOfMonth: input.dayOfMonth ?? null,
          recipients: input.recipients,
          enabled: input.enabled,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        reportType: z.enum(["PROFIT_LOSS", "AGING", "UNPAID", "EXPENSES", "TAX_LIABILITY"]).optional(),
        frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]).optional(),
        dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
        dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
        recipients: z.array(z.string().email()).min(1).max(10).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.scheduledReport.findFirst({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }
      return ctx.db.scheduledReport.update({ where: { id }, data });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.scheduledReport.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled report not found" });
      }
      await ctx.db.scheduledReport.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
