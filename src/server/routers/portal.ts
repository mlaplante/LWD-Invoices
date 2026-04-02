import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { GatewayType, InvoiceStatus, InvoiceType, ProjectStatus } from "@/generated/prisma";
import { decryptJson } from "../services/encryption";
import { getStripeClient, createCheckoutSession } from "../services/stripe";
import type { StripeConfig } from "../services/gateway-config";
import {
  generateSessionToken,
  SESSION_DURATION_MS,
  isSessionExpired,
} from "../services/portal-dashboard";
import {
  hashDocument,
  hashSignature,
  validateSignatureData,
  encryptSignature,
} from "../services/signature";
import bcrypt from "bcryptjs";

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
    .input(
      z.object({
        token: z.string(),
        partialPaymentId: z.string().optional(),
        payFullBalance: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await getInvoiceByToken(ctx.db, input.token);

      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is not payable" });
      }

      // Resolve amount override for partial / balance payments
      let amountOverride: number | undefined;
      let partialPaymentId: string | undefined;

      if (input.partialPaymentId) {
        const partial = await ctx.db.partialPayment.findUnique({
          where: { id: input.partialPaymentId },
        });
        if (!partial || partial.invoiceId !== invoice.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid installment" });
        }
        if (partial.isPaid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Installment already paid" });
        }
        const invoiceTotal = invoice.total.toNumber();
        amountOverride = partial.isPercentage
          ? (partial.amount.toNumber() / 100) * invoiceTotal
          : partial.amount.toNumber();
        partialPaymentId = partial.id;
      } else if (input.payFullBalance) {
        const invoiceTotal = invoice.total.toNumber();
        const paidSoFar = invoice.payments.reduce(
          (sum, p) => sum + p.amount.toNumber(),
          0,
        );
        const remaining = invoiceTotal - paidSoFar;
        if (remaining <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already fully paid" });
        }
        amountOverride = remaining;
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
        partialPaymentId,
        amountOverride,
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
              logoUrl: true,
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
            logoUrl: invoice.organization.logoUrl ?? undefined,
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

  createDashboardSession: publicProcedure
    .input(
      z.object({
        clientToken: z.string(),
        passphrase: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findUnique({
        where: { portalToken: input.clientToken },
        select: { id: true, portalPassphraseHash: true },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });

      if (client.portalPassphraseHash) {
        const valid = await bcrypt.compare(
          input.passphrase ?? "",
          client.portalPassphraseHash,
        );
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const token = generateSessionToken();
      await ctx.db.clientPortalSession.create({
        data: {
          token,
          clientId: client.id,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        },
      });

      return { sessionToken: token };
    }),

  getDashboard: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.clientPortalSession.findUnique({
        where: { token: input.sessionToken },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (isSessionExpired(session.expiresAt)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const client = await ctx.db.client.findUnique({
        where: { id: session.clientId },
        include: {
          organization: { select: { name: true, logoUrl: true } },
        },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });

      const invoices = await ctx.db.invoice.findMany({
        where: {
          clientId: client.id,
          organizationId: client.organizationId,
          isArchived: false,
        },
        include: {
          currency: { select: { symbol: true, symbolPosition: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { date: "desc" },
      });

      const projects = await ctx.db.project.findMany({
        where: {
          clientId: client.id,
          status: ProjectStatus.ACTIVE,
          isViewable: true,
        },
        select: { id: true, name: true, status: true, dueDate: true },
        orderBy: { name: "asc" },
      });

      const recentPayments = await ctx.db.payment.findMany({
        where: {
          invoice: { clientId: client.id },
        },
        include: {
          invoice: {
            select: {
              number: true,
              currency: { select: { symbol: true, symbolPosition: true } },
            },
          },
        },
        orderBy: { paidAt: "desc" },
        take: 20,
      });

      // Compute summary
      const OUTSTANDING_STATUSES: InvoiceStatus[] = [
        InvoiceStatus.SENT,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.OVERDUE,
      ];

      let outstanding = 0;
      let overdue = 0;
      for (const inv of invoices) {
        if (!OUTSTANDING_STATUSES.includes(inv.status)) continue;
        const paid = inv.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        );
        const remaining = Number(inv.total) - paid;
        outstanding += remaining;
        if (inv.status === InvoiceStatus.OVERDUE) {
          overdue += remaining;
        }
      }

      return {
        client: {
          name: client.name,
          email: client.email,
          organizationId: client.organizationId,
          organization: client.organization,
        },
        summary: { outstanding, overdue },
        invoices,
        projects,
        recentPayments,
      };
    }),

  signProposal: publicProcedure
    .input(
      z.object({
        token: z.string(),
        signedByName: z.string().min(1).max(200),
        signedByEmail: z.string().email(),
        signatureData: z.string(),
        legalConsent: z.literal(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate signature data format
      if (!validateSignatureData(input.signatureData)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid signature data",
        });
      }

      // Find invoice by portal token
      const invoice = await ctx.db.invoice.findUnique({
        where: { portalToken: input.token },
        include: {
          proposalContent: true,
          client: { select: { name: true } },
          organization: {
            select: {
              name: true,
              users: { select: { email: true, id: true, role: true } },
            },
          },
        },
      });

      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Must be an ESTIMATE type
      if (invoice.type !== InvoiceType.ESTIMATE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only estimates/proposals can be signed",
        });
      }

      // Must not already be signed
      if (invoice.signedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This proposal has already been signed",
        });
      }

      // Hash document sections and signature
      const sections = (invoice.proposalContent?.sections as Array<{
        key: string;
        title: string;
        content: string;
      }>) ?? [];
      const documentHash = hashDocument(sections);
      const signatureHash = hashSignature(input.signatureData);

      // Encrypt signature data for storage
      const encryptedSignature = encryptSignature(input.signatureData);

      const now = new Date();

      // Update invoice with signature fields and ACCEPTED status
      const updated = await ctx.db.invoice.update({
        where: { id: invoice.id },
        data: {
          signedAt: now,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signedByIp: "0.0.0.0", // IP should be set from request headers in production
          signatureData: encryptedSignature,
          status: InvoiceStatus.ACCEPTED,
        },
      });

      // Create signature audit log
      await ctx.db.signatureAuditLog.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signedByIp: "0.0.0.0",
          documentHash,
          signatureHash,
        },
      });

      // Fire notification (non-fatal)
      try {
        const { notifyOrgAdmins } = await import("@/server/services/notifications");
        await notifyOrgAdmins(invoice.organizationId, {
          type: "ESTIMATE_ACCEPTED",
          title: `Proposal #${invoice.number} signed`,
          body: `${input.signedByName} signed the proposal`,
          link: `/invoices/${invoice.id}`,
        });
      } catch {
        // Notification failure is non-fatal
      }

      // Send email notification (non-fatal)
      try {
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { ProposalSignedEmail } = await import("@/emails/ProposalSignedEmail");
        const { getOwnerBcc } = await import("@/server/services/email-bcc");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invoiceLink = `${appUrl}/invoices/${invoice.id}`;
        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = await render(
          ProposalSignedEmail({
            invoiceNumber: invoice.number,
            clientName: invoice.client.name,
            signedByName: input.signedByName,
            signedByEmail: input.signedByEmail,
            signedAt: now.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            orgName: invoice.organization.name,
            invoiceLink,
            proposalPdfLink: `${appUrl}/api/portal/${input.token}/proposal-pdf`,
          }),
        );

        const adminEmails = invoice.organization.users
          .filter((u) => u.email && u.role === "ADMIN")
          .map((u) => u.email as string);

        const bcc = await getOwnerBcc(invoice.organizationId);

        if (adminEmails.length > 0) {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
            to: adminEmails,
            ...(bcc ? { bcc } : {}),
            subject: `Proposal #${invoice.number} signed by ${input.signedByName}`,
            html,
          });
        }
      } catch {
        // Email failure is non-fatal
      }

      return { status: updated.status, signedAt: updated.signedAt };
    }),
});
