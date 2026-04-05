import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { constructStripeEvent } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";
import type Stripe from "stripe";
import { logAudit } from "@/server/services/audit";
import { sendPaymentReceiptEmail } from "@/server/services/payment-receipt-email";

// Track processed Stripe event IDs to prevent duplicate processing.
// Entries auto-expire after 24 hours. In-memory is sufficient because
// the DB transaction is already idempotent — this is an optimization
// to skip redundant DB work.
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 24 * 60 * 60_000;

function cleanExpiredEvents() {
  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > EVENT_TTL_MS) processedEvents.delete(id);
  }
}

export async function POST(req: NextRequest) {
  // Must use raw text — Stripe signature verification requires exact bytes
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Pre-parse to extract orgId from metadata before verifying
  let preEvent: { data?: { object?: { metadata?: Record<string, string> } } };
  try {
    preEvent = JSON.parse(rawBody) as typeof preEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgId = preEvent?.data?.object?.metadata?.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId in metadata" }, { status: 400 });
  }

  // Load this org's Stripe gateway config
  const gateway = await db.gatewaySetting.findUnique({
    where: {
      organizationId_gatewayType: {
        organizationId: orgId,
        gatewayType: GatewayType.STRIPE,
      },
    },
  });

  if (!gateway?.isEnabled) {
    return NextResponse.json({ error: "Stripe not configured for org" }, { status: 400 });
  }

  let config: StripeConfig;
  try {
    config = decryptJson<StripeConfig>(gateway.configJson);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt config" }, { status: 500 });
  }

  // Now verify with the org's webhook secret
  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, sig, config.webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Cross-validate: ensure the orgId from the verified event matches the pre-parsed one.
  // This prevents an attacker from using one org's webhook secret to process another org's data.
  const verifiedOrgId = (event.data.object as { metadata?: Record<string, string> })?.metadata?.orgId;
  if (verifiedOrgId !== orgId) {
    return NextResponse.json({ error: "OrgId mismatch" }, { status: 400 });
  }

  // Idempotency: skip already-processed events
  cleanExpiredEvents();
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;

    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      include: { partialPayments: true, payments: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const partialPaymentId = session.metadata?.partialPaymentId;

    // Idempotency: skip if fully paid AND no specific installment targeted
    if (invoice.status === InvoiceStatus.PAID && !partialPaymentId) {
      return NextResponse.json({ received: true });
    }

    const amountTotal = session.amount_total ?? 0;
    const chargedAmount = amountTotal / 100; // convert from cents
    const invoiceTotal = invoice.total.toNumber();
    const transactionId =
      (session.payment_intent as string | undefined) ?? session.id;

    await db.$transaction(async (tx) => {
      if (partialPaymentId) {
        // --- Installment payment ---
        const installment = invoice.partialPayments.find(
          (pp) => pp.id === partialPaymentId
        );
        if (!installment || installment.isPaid) {
          return; // idempotency or not found
        }

        const installmentAmount = installment.isPercentage
          ? (installment.amount.toNumber() / 100) * invoiceTotal
          : installment.amount.toNumber();
        const surchargeAmount = Math.max(0, chargedAmount - installmentAmount);

        await tx.payment.create({
          data: {
            amount: installmentAmount,
            surchargeAmount,
            method: "stripe",
            transactionId,
            invoiceId,
            organizationId: orgId,
          },
        });

        await tx.partialPayment.update({
          where: { id: partialPaymentId },
          data: {
            isPaid: true,
            paidAt: new Date(),
            paymentMethod: "stripe",
            transactionId,
          },
        });

        // Check if ALL partial payments are now paid
        const allPartials = await tx.partialPayment.findMany({
          where: { invoiceId },
        });
        const allPaid = allPartials.every((pp) => pp.isPaid);

        await tx.invoice.update({
          where: { id: invoiceId, organizationId: orgId },
          data: {
            status: allPaid
              ? InvoiceStatus.PAID
              : InvoiceStatus.PARTIALLY_PAID,
          },
        });
      } else {
        // --- Full payment / pay full balance ---
        const existingTotal = invoice.payments.reduce(
          (sum, p) => sum + p.amount.toNumber(),
          0
        );
        let paymentAmount = invoiceTotal - existingTotal;
        if (paymentAmount <= 0) paymentAmount = chargedAmount;
        const surchargeAmount = Math.max(0, chargedAmount - paymentAmount);

        await tx.payment.create({
          data: {
            amount: paymentAmount,
            surchargeAmount,
            method: "stripe",
            transactionId,
            invoiceId,
            organizationId: orgId,
          },
        });

        // Mark all unpaid partial payments as paid
        await tx.partialPayment.updateMany({
          where: { invoiceId, isPaid: false },
          data: {
            isPaid: true,
            paidAt: new Date(),
            paymentMethod: "stripe",
            transactionId,
          },
        });

        await tx.invoice.update({
          where: { id: invoiceId, organizationId: orgId },
          data: { status: InvoiceStatus.PAID },
        });
      }
    });

    // Save Stripe Customer ID on the client for future auto-charges
    const clientId = session.metadata?.clientId;
    const customerId = session.customer as string | null;
    if (clientId && customerId) {
      await db.client.update({
        where: { id: clientId, organizationId: orgId },
        data: { stripeCustomerId: customerId },
      });
    }

    await logAudit({
      action: "PAYMENT_RECEIVED",
      entityType: "Invoice",
      entityId: invoiceId,
      entityLabel: `Invoice #${invoice.number}`,
      diff: {
        method: "stripe",
        amount: chargedAmount,
        transactionId,
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
      organizationId: orgId,
    });

    // Send payment receipt email
    try {
      await sendPaymentReceiptEmail({
        invoiceId,
        amountPaid: chargedAmount,
        organizationId: orgId,
        partialPaymentId: partialPaymentId ?? undefined,
      });
    } catch (err) {
      console.error("[stripe-webhook] Failed to send payment receipt email:", err);
    }

    // Fire automation event for payment received
    try {
      const { inngest: inngestClient } = await import("@/inngest/client");
      await inngestClient.send({
        name: "invoice/payment.received",
        data: { invoiceId, trigger: "PAYMENT_RECEIVED" },
      });
    } catch {
      // Non-fatal
    }
  }

  // Mark event as processed
  processedEvents.set(event.id, Date.now());

  return NextResponse.json({ received: true });
}
