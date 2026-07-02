import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { sendEmail } from "@/server/services/email-sender";
import { GatewayType, InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { decryptJson } from "../services/encryption";
import { getStripeClient, createCheckoutSession } from "../services/stripe";
import { resolvePartialPaymentAmount } from "../services/partial-payments";
import { resolveEarlyPayOffer } from "../services/early-payment-discount";
import type { StripeConfig } from "../services/gateway-config";
import {
  dashboardSessionCookieName,
  getDashboardSession,
} from "../services/portal-dashboard";
import { cookies } from "next/headers";
import {
  hashDocument,
  hashSignature,
  validateSignatureData,
  encryptSignature,
} from "../services/signature";

const PAYABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

// Org fields the portal renders directly (branding + address). Excludes
// internal settings like late-fee config, smart-reminder thresholds, and
// stripeTax* flags that the public portal never reads.
const portalOrgSelect = {
  id: true,
  name: true,
  logoUrl: true,
  brandColor: true,
  brandFont: true,
  hidePoweredBy: true,
  portalTagline: true,
  portalFooterText: true,
  invoiceTemplate: true,
  invoiceFontFamily: true,
  invoiceAccentColor: true,
  invoiceShowLogo: true,
  invoiceFooterText: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
} as const;

async function getInvoiceByToken(db: typeof import("../db").db, token: string) {
  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      client: true,
      currency: true,
      organization: { select: portalOrgSelect },
      lines: {
        include: { taxes: { include: { tax: true } } },
        orderBy: { sort: "asc" },
      },
      payments: { orderBy: { paidAt: "asc" } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
  return invoice;
}

/** Live early-pay offer for a portal invoice, or null. */
function getInvoiceEarlyPayOffer(
  invoice: Awaited<ReturnType<typeof getInvoiceByToken>>,
  now = new Date(),
) {
  return resolveEarlyPayOffer({
    percent: invoice.earlyPayDiscountPercent?.toNumber(),
    days: invoice.earlyPayDiscountDays,
    invoiceDate: invoice.date,
    status: invoice.status,
    total: invoice.total.toNumber(),
    paidSoFar: (invoice.payments ?? []).reduce((sum, p) => sum + p.amount.toNumber(), 0),
    hasInstallments: (invoice.partialPayments ?? []).some((pp) => !pp.isPaid),
    redeemedAt: invoice.earlyPayDiscountRedeemedAt,
    now,
  });
}

/**
 * Guard for dashboard-scoped portal procedures: the caller must present a
 * valid dashboard session cookie (issued by the passphrase gate at
 * /api/portal/dashboard/[clientToken]/auth) — the portal link token alone
 * must not expose saved cards or retainer data when a passphrase is set.
 */
async function requireDashboardSession(
  db: typeof import("../db").db,
  clientToken: string,
) {
  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: { id: true, organizationId: true, stripeCustomerId: true },
  });
  if (!client) throw new TRPCError({ code: "NOT_FOUND" });

  const cookieStore = await cookies();
  const presented = cookieStore.get(dashboardSessionCookieName(clientToken))?.value;
  const session = presented ? await getDashboardSession(db, presented) : null;
  if (!session || session.clientId !== client.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return client;
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
          currency: { select: { code: true, symbol: true, symbolPosition: true } },
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
        // Card and bank debit are separate sessions with separate surcharges.
        paymentMethod: z.enum(["card", "bank_debit"]).default("card"),
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
      let extraMetadata: Record<string, string> | undefined;

      // Early-pay discount: any full-balance charge initiated within the
      // window is charged the discounted balance. The webhook reads the
      // metadata back and books the discount when the session settles.
      const earlyPayOffer = input.partialPaymentId
        ? null
        : getInvoiceEarlyPayOffer(invoice);
      if (earlyPayOffer) {
        amountOverride = earlyPayOffer.discountedBalance;
        extraMetadata = {
          earlyPayDiscountAmount: earlyPayOffer.discountAmount.toFixed(2),
        };
      }

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
        amountOverride = resolvePartialPaymentAmount(partial, invoice.total);
        partialPaymentId = partial.id;
      } else if (input.payFullBalance && !earlyPayOffer) {
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
          clientId: invoice.clientId,
        },
        surcharge:
          input.paymentMethod === "bank_debit"
            ? gateway.bankDebitSurcharge.toNumber()
            : gateway.surcharge.toNumber(),
        appUrl,
        partialPaymentId,
        amountOverride,
        clientEmail: invoice.client.email,
        clientName: invoice.client.name,
        stripeCustomerId: invoice.client.stripeCustomerId,
        paymentMethod: input.paymentMethod,
        achDebitEnabled: config.achDebitEnabled,
        sepaDebitEnabled: config.sepaDebitEnabled,
        extraMetadata,
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
              members: { select: { role: true, user: { select: { email: true } } } },
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
        const { render } = await import("@react-email/render");
        const { InvoiceCommentEmail } = await import("@/emails/InvoiceCommentEmail");
        const { notifyOrgAdmins } = await import("@/server/services/notifications");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invoiceLink = `${appUrl}/invoices/${invoice.id}`;

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

        const adminEmails = invoice.organization.members
          .filter((m) => m.user.email && m.role === "ADMIN")
          .map((m) => m.user.email as string);

        if (adminEmails.length > 0) {
          await sendEmail({
            organizationId: invoice.organizationId,
            to: adminEmails,
            subject: `New comment on Invoice #${invoice.number} from ${input.authorName}`,
            html,
          });
        }

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

  listHoursRetainers: publicProcedure
    .input(z.object({ clientToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await requireDashboardSession(ctx.db, input.clientToken);

      const { listPortalRetainers } = await import(
        "@/server/services/portal-hours-retainers"
      );
      return listPortalRetainers(ctx.db, client.id);
    }),

  savedCards: publicProcedure
    .input(z.object({ clientToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await requireDashboardSession(ctx.db, input.clientToken);

      return ctx.db.savedPaymentMethod.findMany({
        where: { clientId: client.id, organizationId: client.organizationId },
        select: {
          id: true,
          last4: true,
          brand: true,
          expiresMonth: true,
          expiresYear: true,
          isDefault: true,
        },
        orderBy: { isDefault: "desc" },
      });
    }),

  removeCard: publicProcedure
    .input(z.object({ clientToken: z.string(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const client = await requireDashboardSession(ctx.db, input.clientToken);

      const card = await ctx.db.savedPaymentMethod.findFirst({
        where: { id: input.cardId, clientId: client.id, organizationId: client.organizationId },
      });
      if (!card) throw new TRPCError({ code: "NOT_FOUND" });

      // Detach from Stripe if possible
      if (client.stripeCustomerId) {
        try {
          const gw = await ctx.db.gatewaySetting.findFirst({
            where: { organizationId: client.organizationId, gatewayType: "STRIPE", isEnabled: true },
          });
          if (gw) {
            const { decryptJson } = await import("@/server/services/encryption");
            const { getStripeClient } = await import("@/server/services/stripe");
            const config = decryptJson<{ secretKey: string }>(gw.configJson);
            const stripe = getStripeClient(config.secretKey);
            await stripe.paymentMethods.detach(card.stripePaymentMethodId);
          }
        } catch (err) {
          console.error("Failed to detach card from Stripe:", err);
        }
      }

      await ctx.db.savedPaymentMethod.delete({ where: { id: card.id } });
      return { success: true };
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
              members: { select: { role: true, user: { select: { email: true } } } },
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
        const { render } = await import("@react-email/render");
        const { ProposalSignedEmail } = await import("@/emails/ProposalSignedEmail");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invoiceLink = `${appUrl}/invoices/${invoice.id}`;

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

        const adminEmails = invoice.organization.members
          .filter((m) => m.user.email && m.role === "ADMIN")
          .map((m) => m.user.email as string);

        if (adminEmails.length > 0) {
          await sendEmail({
            organizationId: invoice.organizationId,
            to: adminEmails,
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
