import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";

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
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
      },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return org;
  }),

  listMyOrgs: protectedProcedure.query(async ({ ctx }) => {
    const dbUser = await ctx.db.user.findFirst({
      where: { supabaseId: ctx.userId },
      select: { id: true },
    });
    if (!dbUser) return [];

    return ctx.db.userOrganization.findMany({
      where: { userId: dbUser.id },
      include: {
        organization: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  switchOrg: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dbUser = await ctx.db.user.findFirst({
        where: { supabaseId: ctx.userId },
        select: { id: true },
      });
      if (!dbUser) throw new TRPCError({ code: "NOT_FOUND" });

      const membership = await ctx.db.userOrganization.findUnique({
        where: {
          userId_organizationId: { userId: dbUser.id, organizationId: input.orgId },
        },
        include: { organization: { select: { id: true, name: true } } },
      });

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
      }

      // Set the cookie
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set("activeOrgId", input.orgId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });

      return membership;
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
        addressLine1: z.string().max(200).nullable().optional(),
        addressLine2: z.string().max(200).nullable().optional(),
        city: z.string().max(100).nullable().optional(),
        state: z.string().max(100).nullable().optional(),
        postalCode: z.string().max(20).nullable().optional(),
        country: z.string().max(100).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: input,
      });

      await logAudit({
        action: "UPDATED",
        entityType: "Organization",
        entityId: result.id,
        entityLabel: result.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      });

      // Sync changed metadata to all org users' app_metadata
      const metaUpdates: Record<string, unknown> = {};
      if (input.require2FA !== undefined) metaUpdates.require2FA = input.require2FA;
      if (input.name !== undefined) metaUpdates.orgName = input.name;

      if (Object.keys(metaUpdates).length > 0) {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const adminSupabase = createAdminClient();

        const orgMemberships = await ctx.db.userOrganization.findMany({
          where: { organizationId: ctx.orgId },
          include: { user: { select: { supabaseId: true } } },
        });
        const orgUsers = orgMemberships.map((m) => m.user);

        await Promise.all(
          orgUsers
            .filter((u) => u.supabaseId)
            .map((u) =>
              adminSupabase.auth.admin.updateUserById(u.supabaseId!, {
                app_metadata: metaUpdates,
              })
            )
        );
      }

      return result;
    }),
});
