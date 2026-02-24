import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "../services/encryption";
import { getStripeClient, createCheckoutSession } from "../services/stripe";
import { createPayPalOrder, capturePayPalOrder } from "../services/paypal";
import type { StripeConfig, PayPalConfig } from "../services/gateway-config";

const PAYABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

async function getInvoiceByToken(db: typeof import("../db").db, token: string) {
  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: {
        include: { taxes: { include: { tax: true } } },
        orderBy: { sort: "asc" },
      },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
  return invoice;
}

export const portalRouter = router({
  getInvoice: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      // Load enabled gateways (safe — no secrets)
      const gateways = await ctx.db.gatewaySetting.findMany({
        where: { organizationId: invoice.organizationId, isEnabled: true },
        select: { gatewayType: true, surcharge: true, label: true },
      });

      // Load public comments (non-private only)
      const comments = await ctx.db.comment.findMany({
        where: { invoiceId: invoice.id, isPrivate: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, authorName: true, createdAt: true },
      });

      return { invoice, gateways, comments };
    }),

  listInvoices: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      // Use the portal token to find the invoice and determine the client
      const invoice = await ctx.db.invoice.findUnique({
        where: { portalToken: input.token },
        select: { clientId: true, organizationId: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.invoice.findMany({
        where: { clientId: invoice.clientId, organizationId: invoice.organizationId, isArchived: false },
        select: {
          id: true,
          number: true,
          status: true,
          date: true,
          dueDate: true,
          total: true,
          portalToken: true,
          currency: { select: { symbol: true, symbolPosition: true } },
        },
        orderBy: { date: "desc" },
      });
    }),

  createStripeCheckout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is not payable" });
      }

      const gateway = await ctx.db.gatewaySetting.findUnique({
        where: {
          organizationId_gatewayType: {
            organizationId: invoice.organizationId,
            gatewayType: GatewayType.STRIPE,
          },
        },
      });
      if (!gateway?.isEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe is not enabled" });
      }

      const config = decryptJson<StripeConfig>(gateway.configJson);
      const stripeClient = getStripeClient(config.secretKey);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { url } = await createCheckoutSession({
        stripeClient,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          total: invoice.total,
          currency: invoice.currency,
          portalToken: invoice.portalToken,
          organizationId: invoice.organizationId,
        },
        surcharge: gateway.surcharge.toNumber(),
        appUrl,
      });

      return { url };
    }),

  createPayPalOrder: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is not payable" });
      }

      const gateway = await ctx.db.gatewaySetting.findUnique({
        where: {
          organizationId_gatewayType: {
            organizationId: invoice.organizationId,
            gatewayType: GatewayType.PAYPAL,
          },
        },
      });
      if (!gateway?.isEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PayPal is not enabled" });
      }

      const config = decryptJson<PayPalConfig>(gateway.configJson);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      const { orderId, approveUrl } = await createPayPalOrder({
        config,
        invoice: {
          id: invoice.id,
          number: invoice.number,
          total: invoice.total,
          currency: invoice.currency,
          portalToken: invoice.portalToken,
          organizationId: invoice.organizationId,
        },
        surcharge: gateway.surcharge.toNumber(),
        appUrl,
      });

      return { orderId, approveUrl };
    }),

  capturePayPalOrder: publicProcedure
    .input(z.object({ token: z.string(), orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      const gateway = await ctx.db.gatewaySetting.findUnique({
        where: {
          organizationId_gatewayType: {
            organizationId: invoice.organizationId,
            gatewayType: GatewayType.PAYPAL,
          },
        },
      });
      if (!gateway?.isEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PayPal is not enabled" });
      }

      const config = decryptJson<PayPalConfig>(gateway.configJson);
      const { transactionId, amount } = await capturePayPalOrder(config, input.orderId);

      const surcharge = gateway.surcharge.toNumber();
      const invoiceTotal = invoice.total.toNumber();
      const chargedAmount = parseFloat(amount);
      const surchargeAmount = chargedAmount - invoiceTotal;

      await ctx.db.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            amount: invoiceTotal,
            surchargeAmount,
            method: "paypal",
            transactionId,
            invoiceId: invoice.id,
            organizationId: invoice.organizationId,
          },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.PAID },
        });
      });

      // Suppress unused var warning
      void surcharge;

      return { success: true, transactionId };
    }),

  addComment: publicProcedure
    .input(
      z.object({
        token: z.string(),
        body: z.string().min(1).max(2000),
        authorName: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { portalToken: input.token },
        select: { id: true, organizationId: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.comment.create({
        data: {
          body: input.body,
          isPrivate: false,
          authorName: input.authorName,
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
        },
        select: { id: true, body: true, authorName: true, createdAt: true },
      });
    }),
});
