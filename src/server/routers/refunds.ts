import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { issueRefund, refundedAmountForPayment } from "../services/refunds";
import { logAudit } from "../services/audit";
import { notifyOrgAdmins } from "../services/notifications";
import { toNum } from "../services/analytics-data";

export const refundsRouter = router({
  // Refunds for one invoice, plus the per-payment refundable balances the UI
  // needs to drive the "Refund" dialog.
  listForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [refunds, payments] = await Promise.all([
        ctx.db.refund.findMany({
          where: { organizationId: ctx.orgId, invoiceId: input.invoiceId },
          orderBy: { createdAt: "desc" },
        }),
        ctx.db.payment.findMany({
          where: { organizationId: ctx.orgId, invoiceId: input.invoiceId },
          select: { id: true, amount: true, method: true, transactionId: true, paidAt: true },
          orderBy: { paidAt: "desc" },
        }),
      ]);

      const refundedByPayment = new Map<string, number>();
      for (const r of refunds) {
        if (r.status === "FAILED" || r.status === "CANCELED") continue;
        refundedByPayment.set(r.paymentId, (refundedByPayment.get(r.paymentId) ?? 0) + toNum(r.amount));
      }

      const refundablePayments = payments.map((p) => {
        const refunded = refundedByPayment.get(p.id) ?? 0;
        return {
          id: p.id,
          amount: toNum(p.amount),
          method: p.method,
          paidAt: p.paidAt,
          isStripe: p.method === "stripe" && !!p.transactionId,
          refunded,
          refundable: Math.max(0, toNum(p.amount) - refunded),
        };
      });

      return { refunds, payments: refundablePayments };
    }),

  // Org-wide refund history.
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.refund.findMany({
        where: { organizationId: ctx.orgId },
        include: { invoice: { select: { id: true, number: true, client: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 50,
      });
    }),

  // Issue a refund (Stripe or manual) against a payment. Optionally also issues
  // a credit note for the refunded amount.
  issue: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        paymentId: z.string(),
        amount: z.number().positive(),
        reason: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        createCreditNote: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Guard: payment must belong to the org (issueRefund re-checks, but we want
      // a clean NOT_FOUND rather than a thrown Error string).
      const payment = await ctx.db.payment.findFirst({
        where: { id: input.paymentId, organizationId: ctx.orgId },
        select: { id: true, invoiceId: true, invoice: { select: { number: true, client: { select: { name: true } } } } },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });

      let result;
      try {
        result = await issueRefund({
          db: ctx.db as never,
          orgId: ctx.orgId,
          paymentId: input.paymentId,
          amount: input.amount,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          createdByUserId: ctx.userId,
          createCreditNote: input.createCreditNote,
        });
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Invoice",
        entityId: payment.invoiceId,
        entityLabel: `Invoice #${payment.invoice.number}`,
        diff: {
          event: "refund_issued",
          amount: result.amount,
          method: result.method,
          status: result.status,
          creditNoteId: result.creditNoteId,
        },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      await notifyOrgAdmins(ctx.orgId, {
        type: "REFUND_ISSUED",
        title: `Refund issued — #${payment.invoice.number}`,
        body: `${result.amount.toFixed(2)} refunded to ${payment.invoice.client.name} (${result.method}).`,
        link: `/invoices/${payment.invoiceId}`,
      }).catch(() => {});

      return result;
    }),

  // Refundable balance for a single payment (used to validate the dialog).
  refundableForPayment: protectedProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.db.payment.findFirst({
        where: { id: input.paymentId, organizationId: ctx.orgId },
        select: { amount: true },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
      const refunded = await refundedAmountForPayment(ctx.db as never, input.paymentId);
      return { refundable: Math.max(0, toNum(payment.amount) - refunded), refunded };
    }),
});
