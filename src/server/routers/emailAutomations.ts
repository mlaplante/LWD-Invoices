import { z } from "zod";
import { router, requireRole, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const emailAutomationsRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .query(async ({ ctx }) => {
      return ctx.db.emailAutomation.findMany({
        where: { organizationId: ctx.orgId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        trigger: z.enum(["PAYMENT_RECEIVED", "INVOICE_SENT", "INVOICE_VIEWED", "INVOICE_OVERDUE"]),
        delayDays: z.number().int().min(0).max(90).default(0),
        templateSubject: z.string().min(1).max(200),
        templateBody: z.string().min(1).max(5000),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.emailAutomation.create({
        data: {
          ...input,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        trigger: z.enum(["PAYMENT_RECEIVED", "INVOICE_SENT", "INVOICE_VIEWED", "INVOICE_OVERDUE"]).optional(),
        delayDays: z.number().int().min(0).max(90).optional(),
        templateSubject: z.string().min(1).max(200).optional(),
        templateBody: z.string().min(1).max(5000).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.emailAutomation.findFirst({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Automation not found" });
      }
      return ctx.db.emailAutomation.update({
        where: { id },
        data,
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.emailAutomation.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Automation not found" });
      }
      await ctx.db.emailAutomation.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getLogs: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        automationId: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.emailAutomationLog.findMany({
        where: {
          automation: {
            organizationId: ctx.orgId,
          },
          ...(input?.automationId ? { automationId: input.automationId } : {}),
        },
        orderBy: { sentAt: "desc" },
        take: 50,
      });
    }),
});
