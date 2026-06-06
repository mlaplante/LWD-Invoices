import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { NEC_1099_THRESHOLD } from "@/server/services/contractor-1099";

/**
 * Public, token-authenticated contractor portal API. Mirrors the client portal
 * pattern: every procedure takes the contractor's opaque `portalToken` and
 * resolves it without the normal session auth. Access is additionally gated on
 * the org having enabled the portal for that contractor (`portalEnabled`).
 */

async function resolveContractor(db: typeof import("../db").db, token: string) {
  const contractor = await db.contractor.findUnique({
    where: { portalToken: token },
    include: {
      organization: {
        select: {
          name: true,
          logoUrl: true,
          brandColor: true,
          portalTagline: true,
          portalFooterText: true,
          brandFont: true,
          hidePoweredBy: true,
        },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          method: true,
          memo: true,
          reference: true,
          reportable: true,
        },
      },
    },
  });
  if (!contractor || !contractor.portalEnabled || contractor.isArchived) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Portal not found." });
  }
  return contractor;
}

export const contractorPortalRouter = router({
  get: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const c = await resolveContractor(ctx.db, input.token);

      // Per-year reportable totals → 1099-NEC eligibility.
      const byYear = new Map<number, { total: number; count: number }>();
      for (const p of c.payments) {
        if (!p.reportable) continue;
        const year = p.paidAt.getUTCFullYear();
        const entry = byYear.get(year) ?? { total: 0, count: 0 };
        entry.total += Number(p.amount);
        entry.count++;
        byYear.set(year, entry);
      }
      const years = Array.from(byYear.entries())
        .map(([year, v]) => {
          const meetsThreshold = v.total >= NEC_1099_THRESHOLD;
          return {
            year,
            reportableTotal: Math.round(v.total * 100) / 100,
            paymentCount: v.count,
            meetsThreshold,
            eligible: meetsThreshold && !c.exemptFrom1099,
          };
        })
        .sort((a, b) => b.year - a.year);

      return {
        branding: {
          name: c.organization.name,
          logoUrl: c.organization.logoUrl,
          brandColor: c.organization.brandColor,
          portalTagline: c.organization.portalTagline,
          portalFooterText: c.organization.portalFooterText,
          brandFont: c.organization.brandFont,
          hidePoweredBy: c.organization.hidePoweredBy,
        },
        contractor: {
          legalName: c.legalName,
          businessName: c.businessName,
          taxClassification: c.taxClassification,
          tinType: c.tinType,
          tinLast4: c.tinLast4,
          email: c.email,
          city: c.city,
          state: c.state,
          w9Status: c.w9Status,
          w9ReceivedAt: c.w9ReceivedAt,
          exemptFrom1099: c.exemptFrom1099,
        },
        payments: c.payments.map((p) => ({
          id: p.id,
          amount: Math.round(Number(p.amount) * 100) / 100,
          paidAt: p.paidAt,
          method: p.method,
          memo: p.memo,
          reference: p.reference,
          reportable: p.reportable,
        })),
        years,
      };
    }),
});
