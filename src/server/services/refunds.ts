/**
 * Refund management.
 *
 * First-class refunds tied to a Payment + Invoice. `issueRefund` drives a Stripe
 * refund (or records a manual/off-platform return) and writes a Refund row;
 * `reconcileChargeRefunds` keeps those rows in sync with charge.refunded webhook
 * events (and surfaces refunds initiated directly in the Stripe dashboard).
 *
 * Optionally a refund also issues a credit note — a single-line CREDIT_NOTE
 * invoice for the refunded amount, linked back via Refund.creditNoteId — so the
 * books reflect the reversal.
 */

import type Stripe from "stripe";
import type { db as Db } from "../db";
import { InvoiceStatus, InvoiceType, Prisma, RefundStatus } from "@/generated/prisma";
import { generateCreditNoteNumber } from "./credit-note-numbering";
import { generatePortalToken } from "@/lib/portal-session";
import { toNum } from "./analytics-data";

// Stripe only accepts these three refund reasons; anything else is sent as
// undefined and kept in our own `reason` column.
const STRIPE_REASONS = new Set(["duplicate", "fraudulent", "requested_by_customer"]);

export function mapStripeRefundStatus(status: string | null | undefined): RefundStatus {
  switch (status) {
    case "succeeded":
      return RefundStatus.SUCCEEDED;
    case "failed":
      return RefundStatus.FAILED;
    case "canceled":
      return RefundStatus.CANCELED;
    default:
      return RefundStatus.PENDING; // pending / requires_action / null
  }
}

/**
 * Amount already refunded against a payment (PENDING + SUCCEEDED rows count;
 * FAILED/CANCELED don't). Used to cap new refunds at the remaining balance.
 */
export async function refundedAmountForPayment(
  db: typeof Db,
  paymentId: string,
): Promise<number> {
  const agg = await db.refund.aggregate({
    where: { paymentId, status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] } },
    _sum: { amount: true },
  });
  return toNum(agg._sum.amount);
}

export interface IssueRefundArgs {
  db: typeof Db;
  orgId: string;
  paymentId: string;
  amount: number;
  reason?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  createCreditNote?: boolean;
}

export interface IssueRefundResult {
  refundId: string;
  status: RefundStatus;
  method: "stripe" | "manual";
  creditNoteId: string | null;
  amount: number;
}

export async function issueRefund(args: IssueRefundArgs): Promise<IssueRefundResult> {
  const { db, orgId, paymentId, amount } = args;
  if (amount <= 0) throw new Error("Refund amount must be positive");

  const payment = await db.payment.findFirst({
    where: { id: paymentId, organizationId: orgId },
    select: {
      id: true,
      amount: true,
      method: true,
      transactionId: true,
      invoiceId: true,
      invoice: {
        select: {
          id: true,
          number: true,
          clientId: true,
          currencyId: true,
          exchangeRate: true,
          currency: { select: { code: true } },
          status: true,
        },
      },
    },
  });
  if (!payment) throw new Error("Payment not found");

  const alreadyRefunded = await refundedAmountForPayment(db, paymentId);
  const refundable = toNum(payment.amount) - alreadyRefunded;
  if (amount > refundable + 0.0001) {
    throw new Error(
      `Refund exceeds refundable balance of ${refundable.toFixed(2)} on this payment`,
    );
  }

  const isStripe = payment.method === "stripe" && !!payment.transactionId;
  const currency = payment.invoice.currency.code.toUpperCase();

  let stripeRefundId: string | null = null;
  let status: RefundStatus = RefundStatus.SUCCEEDED; // manual refunds settle immediately
  let method: "stripe" | "manual" = "manual";

  if (isStripe) {
    method = "stripe";
    const { getStripeClientForOrg } = await import("./stripe-client");
    const access = await getStripeClientForOrg(db as never, orgId);
    if (!access) {
      throw new Error("Stripe is not configured for this organization");
    }
    const reason =
      args.reason && STRIPE_REASONS.has(args.reason)
        ? (args.reason as Stripe.RefundCreateParams.Reason)
        : undefined;
    const refund = await access.stripe.refunds.create({
      payment_intent: payment.transactionId!,
      amount: Math.round(amount * 100),
      ...(reason ? { reason } : {}),
      metadata: { orgId, invoiceId: payment.invoiceId, paymentId },
    });
    stripeRefundId = refund.id;
    status = mapStripeRefundStatus(refund.status);
  }

  let creditNoteId: string | null = null;
  if (args.createCreditNote) {
    creditNoteId = await createRefundCreditNote(db, orgId, {
      sourceInvoiceId: payment.invoice.id,
      clientId: payment.invoice.clientId,
      currencyId: payment.invoice.currencyId,
      exchangeRate: toNum(payment.invoice.exchangeRate),
      invoiceNumber: payment.invoice.number,
      amount,
    });
  }

  const refund = await db.refund.create({
    data: {
      stripeRefundId,
      amount: new Prisma.Decimal(amount),
      currency,
      reason: args.reason ?? null,
      status,
      method,
      notes: args.notes ?? null,
      creditNoteId,
      createdByUserId: args.createdByUserId ?? null,
      paymentId,
      invoiceId: payment.invoiceId,
      organizationId: orgId,
    },
    select: { id: true },
  });

  // A full refund on a paid invoice flips it back to SENT so it reads as
  // outstanding again — mirrors the webhook's full-refund handling.
  if (status === RefundStatus.SUCCEEDED && payment.invoice.status === InvoiceStatus.PAID) {
    const totalRefunded = alreadyRefunded + amount;
    if (totalRefunded >= toNum(payment.amount) - 0.0001) {
      await db.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: InvoiceStatus.SENT },
      });
    }
  }

  return { refundId: refund.id, status, method, creditNoteId, amount };
}

/**
 * Create a single-line monetary credit note for a refund. Unlike the line-based
 * credit notes in the creditNotes router, this represents the refunded amount as
 * one STANDARD line — enough to keep the books square without recomputing tax.
 */
async function createRefundCreditNote(
  db: typeof Db,
  orgId: string,
  args: {
    sourceInvoiceId: string;
    clientId: string;
    currencyId: string;
    exchangeRate: number;
    invoiceNumber: string;
    amount: number;
  },
): Promise<string> {
  const number = await generateCreditNoteNumber(orgId);
  const cn = await db.invoice.create({
    data: {
      number,
      type: InvoiceType.CREDIT_NOTE,
      status: InvoiceStatus.SENT,
      creditNoteStatus: "ISSUED",
      sourceInvoiceId: args.sourceInvoiceId,
      date: new Date(),
      subtotal: new Prisma.Decimal(args.amount),
      discountTotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      total: new Prisma.Decimal(args.amount),
      currencyId: args.currencyId,
      exchangeRate: new Prisma.Decimal(args.exchangeRate),
      notes: `Refund against invoice #${args.invoiceNumber}`,
      clientId: args.clientId,
      organizationId: orgId,
      portalToken: generatePortalToken(),
      lines: {
        create: [
          {
            sort: 0,
            name: `Refund — Invoice #${args.invoiceNumber}`,
            qty: new Prisma.Decimal(1),
            rate: new Prisma.Decimal(args.amount),
            subtotal: new Prisma.Decimal(args.amount),
            taxTotal: new Prisma.Decimal(0),
            total: new Prisma.Decimal(args.amount),
          },
        ],
      },
    },
    select: { id: true },
  });
  return cn.id;
}

/**
 * Sync Refund rows from a charge.refunded event. Upserts each Stripe refund on
 * the charge by stripeRefundId so both app-issued and dashboard-issued refunds
 * are reflected. Idempotent.
 */
export async function reconcileChargeRefunds(
  db: typeof Db,
  orgId: string,
  charge: Stripe.Charge,
): Promise<{ reconciled: number }> {
  const refunds = charge.refunds?.data ?? [];
  if (refunds.length === 0) return { reconciled: 0 };

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  const payment = paymentIntentId
    ? await db.payment.findFirst({
        where: { transactionId: paymentIntentId, organizationId: orgId },
        select: { id: true, invoiceId: true },
      })
    : null;
  if (!payment) return { reconciled: 0 };

  let reconciled = 0;
  for (const r of refunds) {
    const status = mapStripeRefundStatus(r.status);
    const existing = await db.refund.findUnique({
      where: { stripeRefundId: r.id },
      select: { id: true },
    });
    if (existing) {
      await db.refund.update({ where: { id: existing.id }, data: { status } });
    } else {
      await db.refund.create({
        data: {
          stripeRefundId: r.id,
          amount: new Prisma.Decimal((r.amount ?? 0) / 100),
          currency: (r.currency ?? charge.currency ?? "usd").toUpperCase(),
          reason: r.reason ?? null,
          status,
          method: "stripe",
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          organizationId: orgId,
        },
      });
    }
    reconciled++;
  }
  return { reconciled };
}
