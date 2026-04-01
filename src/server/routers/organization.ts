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
        portalTagline: true,
        portalFooterText: true,
        brandFont: true,
        hidePoweredBy: true,
        invoiceTemplate: true,
        invoiceFontFamily: true,
        invoiceAccentColor: true,
        invoiceShowLogo: true,
        invoiceFooterText: true,
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeAmount: true,
        lateFeeGraceDays: true,
        lateFeeRecurring: true,
        lateFeeMaxApplications: true,
        lateFeeIntervalDays: true,
        require2FA: true,
        defaultDepositPercent: true,
        smartRemindersEnabled: true,
        smartRemindersThreshold: true,
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
        portalTagline: z.string().max(200).nullable().optional(),
        portalFooterText: z.string().max(500).nullable().optional(),
        brandFont: z.enum(["inter", "georgia", "system"]).nullable().optional(),
        hidePoweredBy: z.boolean().optional(),
        invoiceTemplate: z.enum(["modern", "classic", "minimal", "compact"]).optional(),
        invoiceFontFamily: z.enum(["helvetica", "georgia", "courier"]).nullable().optional(),
        invoiceAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        invoiceShowLogo: z.boolean().optional(),
        invoiceFooterText: z.string().max(500).nullable().optional(),
        require2FA: z.boolean().optional(),
        defaultDepositPercent: z.number().int().min(1).max(100).nullable().optional(),
        smartRemindersEnabled: z.boolean().optional(),
        smartRemindersThreshold: z.number().int().min(50).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: input,
      });

      // If require2FA was changed, sync to all org users' app_metadata
      if (input.require2FA !== undefined) {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const adminSupabase = createAdminClient();

        const orgUsers = await ctx.db.user.findMany({
          where: { organizationId: ctx.orgId },
          select: { supabaseId: true },
        });

        // Update each user's app_metadata with the require2FA flag
        await Promise.all(
          orgUsers
            .filter((u) => u.supabaseId)
            .map((u) =>
              adminSupabase.auth.admin.updateUserById(u.supabaseId!, {
                app_metadata: { require2FA: input.require2FA },
              })
            )
        );
      }

      return org;
    }),
});
