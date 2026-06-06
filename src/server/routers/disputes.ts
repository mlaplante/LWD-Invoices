import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { DisputeStatus } from "@/generated/prisma";
import { logAudit } from "../services/audit";

// Stripe dispute-evidence text fields we expose. Files (receipts, shipping docs)
// are intentionally out of scope for this first pass — text evidence covers the
// common "product delivered / service rendered" rebuttal.
const evidenceSchema = z.object({
  productDescription: z.string().max(20000).optional(),
  customerName: z.string().max(500).optional(),
  customerEmailAddress: z.string().max(500).optional(),
  billingAddress: z.string().max(500).optional(),
  customerPurchaseIp: z.string().max(100).optional(),
  serviceDate: z.string().max(100).optional(),
  serviceDocumentation: z.string().max(20000).optional(),
  uncategorizedText: z.string().max(20000).optional(),
});

const OPEN_STATUSES: DisputeStatus[] = [DisputeStatus.NEEDS_RESPONSE, DisputeStatus.UNDER_REVIEW];

export const disputesRouter = router({
  // Disputes list with optional status filter. Open disputes first, then newest.
  list: protectedProcedure
    .input(z.object({ status: z.enum(["open", "all"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const disputes = await ctx.db.dispute.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input?.status === "open" ? { status: { in: OPEN_STATUSES } } : {}),
        },
        include: {
          invoice: { select: { id: true, number: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
      });
      // Surface a quick "needs response" count for the badge.
      const openCount = disputes.filter((d) => OPEN_STATUSES.includes(d.status)).length;
      return { disputes, openCount };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dispute = await ctx.db.dispute.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          invoice: { select: { id: true, number: true, total: true } },
          client: { select: { id: true, name: true, email: true } },
          payment: { select: { id: true, amount: true, paidAt: true } },
        },
      });
      if (!dispute) throw new TRPCError({ code: "NOT_FOUND" });
      return dispute;
    }),

  updateNotes: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), internalNotes: z.string().max(10000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.dispute.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.dispute.update({
        where: { id: input.id },
        data: { internalNotes: input.internalNotes },
      });
    }),

  // Submit evidence to Stripe to contest the dispute. `submit: true` finalizes;
  // otherwise the evidence is staged on the dispute for later submission.
  submitEvidence: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        evidence: evidenceSchema,
        submit: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dispute = await ctx.db.dispute.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, stripeDisputeId: true, status: true, invoiceId: true, invoice: { select: { number: true } } },
      });
      if (!dispute) throw new TRPCError({ code: "NOT_FOUND" });
      if (!OPEN_STATUSES.includes(dispute.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Dispute is ${dispute.status} and can no longer accept evidence.`,
        });
      }

      const { getStripeClientForOrg } = await import("@/server/services/stripe-client");
      const access = await getStripeClientForOrg(ctx.db as never, ctx.orgId);
      if (!access) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured for this organization." });
      }

      const e = input.evidence;
      const updated = await access.stripe.disputes.update(dispute.stripeDisputeId, {
        evidence: {
          ...(e.productDescription ? { product_description: e.productDescription } : {}),
          ...(e.customerName ? { customer_name: e.customerName } : {}),
          ...(e.customerEmailAddress ? { customer_email_address: e.customerEmailAddress } : {}),
          ...(e.billingAddress ? { billing_address: e.billingAddress } : {}),
          ...(e.customerPurchaseIp ? { customer_purchase_ip: e.customerPurchaseIp } : {}),
          ...(e.serviceDate ? { service_date: e.serviceDate } : {}),
          ...(e.serviceDocumentation ? { service_documentation: e.serviceDocumentation } : {}),
          ...(e.uncategorizedText ? { uncategorized_text: e.uncategorizedText } : {}),
        },
        ...(input.submit ? { submit: true } : {}),
      });

      // Re-sync local row from the updated Stripe dispute.
      const { upsertDisputeFromStripe } = await import("@/server/services/disputes");
      await upsertDisputeFromStripe(ctx.db as never, ctx.orgId, updated);
      const result = await ctx.db.dispute.update({
        where: { id: dispute.id },
        data: input.submit ? { evidenceSubmittedAt: new Date() } : {},
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Dispute",
        entityId: dispute.id,
        entityLabel: dispute.invoice?.number ? `Dispute on #${dispute.invoice.number}` : "Dispute",
        diff: { event: input.submit ? "evidence_submitted" : "evidence_saved" },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return result;
    }),

  // Concede the dispute (don't contest). Stripe closes it in the customer's
  // favor; we mark it lost locally so the queue stops nagging.
  accept: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dispute = await ctx.db.dispute.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, stripeDisputeId: true, status: true },
      });
      if (!dispute) throw new TRPCError({ code: "NOT_FOUND" });
      if (!OPEN_STATUSES.includes(dispute.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Dispute is already ${dispute.status}.` });
      }

      const { getStripeClientForOrg } = await import("@/server/services/stripe-client");
      const access = await getStripeClientForOrg(ctx.db as never, ctx.orgId);
      if (!access) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured for this organization." });
      }
      await access.stripe.disputes.close(dispute.stripeDisputeId);

      const result = await ctx.db.dispute.update({
        where: { id: dispute.id },
        data: { status: DisputeStatus.LOST, stripeStatus: "lost" },
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Dispute",
        entityId: dispute.id,
        entityLabel: "Dispute",
        diff: { event: "accepted_conceded" },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return result;
    }),
});
