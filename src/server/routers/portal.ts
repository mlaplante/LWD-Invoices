import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "../services/encryption";
import { getStripeClient, createCheckoutSession } from "../services/stripe";
import type { StripeConfig } from "../services/gateway-config";

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
        select: {
          id: true,
          number: true,
          organizationId: true,
          client: { select: { name: true } },
          organization: {
            select: {
              name: true,
              users: { select: { email: true, supabaseId: true, id: true, role: true } },
            },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const comment = await ctx.db.comment.create({
        data: {
          body: input.body,
          isPrivate: false,
          authorName: input.authorName,
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
        },
        select: { id: true, body: true, authorName: true, createdAt: true },
      });

      // Fire-and-forget notifications (non-fatal)
      try {
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { InvoiceCommentEmail } = await import("@/emails/InvoiceCommentEmail");
        const { notifyOrgAdmins } = await import("@/server/services/notifications");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invoiceLink = `${appUrl}/invoices/${invoice.id}`;
        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = await render(
          InvoiceCommentEmail({
            invoiceNumber: invoice.number,
            clientName: invoice.client.name,
            authorName: input.authorName,
            commentBody: input.body,
            orgName: invoice.organization.name,
            invoiceLink,
          }),
        );

        await Promise.all(
          invoice.organization.users
            .filter((u) => u.email && u.role === "ADMIN")
            .map((u) =>
              resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
                to: u.email as string,
                subject: `New comment on Invoice #${invoice.number} from ${input.authorName}`,
                html,
              }),
            ),
        );

        await notifyOrgAdmins(invoice.organizationId, {
          type: "INVOICE_COMMENT",
          title: `New comment on Invoice #${invoice.number}`,
          body: `${input.authorName}: ${input.body.slice(0, 100)}${input.body.length > 100 ? "…" : ""}`,
          link: `/invoices/${invoice.id}`,
        });
      } catch {
        // Notification failure is non-fatal
      }

      return comment;
    }),
});
