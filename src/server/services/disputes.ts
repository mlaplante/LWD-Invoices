/**
 * Dispute / chargeback handling.
 *
 * Mirrors Stripe `charge.dispute.*` webhook events into the local Dispute table
 * and links each dispute back to the Payment / Invoice / Client it concerns.
 * Evidence submission (stripe.disputes.update) lives in the disputes router so
 * it can use the org's Stripe client; this module owns the read/normalize/upsert
 * side that both the webhook and a manual backfill share.
 */

import type Stripe from "stripe";
import type { db as Db } from "../db";
import { DisputeStatus, Prisma } from "@/generated/prisma";

/** Map Stripe's dispute status string onto our normalized enum. */
export function normalizeDisputeStatus(stripeStatus: string): DisputeStatus {
  switch (stripeStatus) {
    case "needs_response":
    case "warning_needs_response":
      return DisputeStatus.NEEDS_RESPONSE;
    case "under_review":
    case "warning_under_review":
      return DisputeStatus.UNDER_REVIEW;
    case "won":
      return DisputeStatus.WON;
    case "lost":
      return DisputeStatus.LOST;
    case "warning_closed":
      return DisputeStatus.WARNING_CLOSED;
    case "charge_refunded":
      return DisputeStatus.CHARGE_REFUNDED;
    default:
      return DisputeStatus.CLOSED;
  }
}

function idOf(ref: string | { id?: string } | null | undefined): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id ?? null;
}

export interface UpsertDisputeResult {
  disputeId: string;
  isNew: boolean;
  status: DisputeStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
}

/**
 * Create or update the local Dispute row for a Stripe dispute. Idempotent on
 * stripeDisputeId. Links to the originating Payment (and through it the invoice
 * + client) by matching the dispute's payment_intent against Payment.transactionId.
 */
export async function upsertDisputeFromStripe(
  db: typeof Db,
  orgId: string,
  dispute: Stripe.Dispute,
): Promise<UpsertDisputeResult> {
  const paymentIntentId = idOf(dispute.payment_intent);
  const chargeId = idOf(dispute.charge);

  // Match the originating payment by PaymentIntent id (how we store transactionId).
  const payment = paymentIntentId
    ? await db.payment.findFirst({
        where: { transactionId: paymentIntentId, organizationId: orgId },
        select: { id: true, invoiceId: true, invoice: { select: { number: true, clientId: true, client: { select: { name: true } } } } },
      })
    : null;

  const status = normalizeDisputeStatus(dispute.status);
  const evidenceDueBy =
    dispute.evidence_details?.due_by != null
      ? new Date(dispute.evidence_details.due_by * 1000)
      : null;

  const base = {
    stripeChargeId: chargeId,
    paymentIntentId,
    amount: new Prisma.Decimal((dispute.amount ?? 0) / 100),
    currency: (dispute.currency ?? "usd").toUpperCase(),
    reason: dispute.reason ?? null,
    status,
    stripeStatus: dispute.status,
    evidenceDueBy,
    isRefundable: dispute.is_charge_refundable ?? true,
    paymentId: payment?.id ?? null,
    invoiceId: payment?.invoiceId ?? null,
    clientId: payment?.invoice?.clientId ?? null,
  };

  const existing = await db.dispute.findUnique({
    where: { stripeDisputeId: dispute.id },
    select: { id: true },
  });

  if (existing) {
    await db.dispute.update({ where: { id: existing.id }, data: base });
    return {
      disputeId: existing.id,
      isNew: false,
      status,
      invoiceId: payment?.invoiceId ?? null,
      invoiceNumber: payment?.invoice?.number ?? null,
      clientName: payment?.invoice?.client?.name ?? null,
    };
  }

  const created = await db.dispute.create({
    data: { ...base, stripeDisputeId: dispute.id, organizationId: orgId },
    select: { id: true },
  });
  return {
    disputeId: created.id,
    isNew: true,
    status,
    invoiceId: payment?.invoiceId ?? null,
    invoiceNumber: payment?.invoice?.number ?? null,
    clientName: payment?.invoice?.client?.name ?? null,
  };
}
