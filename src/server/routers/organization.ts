import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";

export const organizationRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandColor: true,
        invoicePrefix: true,
        invoiceNextNumber: true,
        taskTimeInterval: true,
        defaultPaymentTermsDays: true,
        paymentReminderDays: true,
        emailBccOwner: true,
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
        lateFeeRecurring: true,
        lateFeeMaxApplications: true,
        lateFeeIntervalDays: true,
      },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return org;
  }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        name: z.string().min(1).optional(),
        logoUrl: z.string().url().nullable().optional(),
        brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        invoicePrefix: z.string().min(1).max(10).optional(),
        invoiceNextNumber: z.number().int().positive().optional(),
        taskTimeInterval: z.number().min(0).optional(),
        defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
        paymentReminderDays: z.array(z.number().int().min(1).max(365)).optional(),
        emailBccOwner: z.boolean().optional(),
        lateFeeEnabled: z.boolean().optional(),
        lateFeeType: z.enum(["flat", "percentage"]).nullable().optional(),
        lateFeeAmount: z.number().min(0).optional(),
        lateFeeGraceDays: z.number().int().min(0).optional(),
        lateFeeRecurring: z.boolean().optional(),
        lateFeeMaxApplications: z.number().int().min(1).nullable().optional(),
        lateFeeIntervalDays: z.number().int().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: input,
      });
    }),
});
