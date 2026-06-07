import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { invalidateOrg } from "../cached";

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
        proposalNudgeEnabled: true,
        proposalNudgeDelayHours: true,
        weeklyBriefingEnabled: true,
        weeklyBriefingRecipients: true,
        weeklyBriefingLastSentAt: true,
        stripeTaxEnabled: true,
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
        proposalNudgeEnabled: z.boolean().optional(),
        proposalNudgeDelayHours: z.number().int().min(1).max(720).optional(),
        weeklyBriefingEnabled: z.boolean().optional(),
        // Capped at 10 recipients to match other fan-out limits in the app.
        weeklyBriefingRecipients: z.array(z.string().email()).max(10).optional(),
        // stripeTaxEnabled intentionally omitted — flip via setStripeTaxEnabled
        // so the preflight (Stripe gateway active + complete origin address) runs.
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
      invalidateOrg(ctx.orgId, "branding");

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

  // Preflight check: surfaces address gaps that would make resolveInvoiceTax
  // throw at submit time. Call from the invoice form to display inline
  // warnings before the user tries to save.
  stripeTaxPreflight: protectedProcedure
    .input(z.object({ clientId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findUnique({
        where: { id: ctx.orgId },
        select: {
          stripeTaxEnabled: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      // Not on Stripe Tax — nothing to preflight.
      if (!org.stripeTaxEnabled) return { ok: true as const, missing: [] };

      const { GatewayType } = await import("@/generated/prisma");
      const gateway = await ctx.db.gatewaySetting.findFirst({
        where: {
          organizationId: ctx.orgId,
          gatewayType: GatewayType.STRIPE,
          isEnabled: true,
        },
        select: { id: true },
      });

      const missing: string[] = [];
      if (!gateway) missing.push("Stripe gateway");
      if (!org.addressLine1) missing.push("Org street address");
      if (!org.city) missing.push("Org city");
      if (!org.postalCode) missing.push("Org postal code");
      if (!org.country) missing.push("Org country");
      if ((org.country === "US" || org.country === "CA") && !org.state) {
        missing.push("Org state/province");
      }

      if (input.clientId) {
        const client = await ctx.db.client.findFirst({
          where: { id: input.clientId, organizationId: ctx.orgId },
          select: { address: true, city: true, state: true, zip: true, country: true },
        });
        if (client) {
          if (!client.address) missing.push("Client street address");
          if (!client.city) missing.push("Client city");
          if (!client.zip) missing.push("Client postal code");
          if (!client.country) missing.push("Client country");
          if ((client.country === "US" || client.country === "CA") && !client.state) {
            missing.push("Client state/province");
          }
        }
      }

      return { ok: missing.length === 0, missing };
    }),

  // Dedicated mutation for the Stripe Tax toggle. Plain organization.update
  // would let a caller flip the flag without preflight; this enforces the
  // prerequisites server-side so the org can't enter a state where Stripe
  // Tax is "on" but Stripe key / address are missing.
  setStripeTaxEnabled: requireRole("OWNER", "ADMIN")
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.enabled) {
        const { GatewayType } = await import("@/generated/prisma");
        const [gateway, org] = await Promise.all([
          ctx.db.gatewaySetting.findFirst({
            where: {
              organizationId: ctx.orgId,
              gatewayType: GatewayType.STRIPE,
              isEnabled: true,
            },
            select: { id: true },
          }),
          ctx.db.organization.findUnique({
            where: { id: ctx.orgId },
            select: {
              addressLine1: true,
              city: true,
              state: true,
              postalCode: true,
              country: true,
            },
          }),
        ]);

        if (!gateway) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Stripe Tax requires an active Stripe payment gateway. Configure Stripe under Settings → Payments first.",
          });
        }

        if (!org) throw new TRPCError({ code: "NOT_FOUND" });

        const missing: string[] = [];
        if (!org.addressLine1) missing.push("street address");
        if (!org.city) missing.push("city");
        if (!org.postalCode) missing.push("postal code");
        if (!org.country) missing.push("country");
        if ((org.country === "US" || org.country === "CA") && !org.state) {
          missing.push("state/province");
        }
        if (missing.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Stripe Tax needs a complete origin address. Missing: ${missing.join(", ")}.`,
          });
        }
      }

      return ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: { stripeTaxEnabled: input.enabled },
        select: { stripeTaxEnabled: true },
      });
    }),
});
