import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import type Stripe from "stripe";
import { logAudit } from "@/server/services/audit";
import { sendPaymentReceiptEmail } from "@/server/services/payment-receipt-email";
import { saveStripeCard } from "@/server/services/save-stripe-card";
import { getStripeClient } from "@/server/services/stripe";
import { validateStripeWebhook } from "@/server/services/stripe-webhook-validator";

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
  const validated = await validateStripeWebhook(req);
  if (!validated.ok) return validated.response;
  const { event, orgId, config } = validated;

  // Idempotency: skip already-processed events
  cleanExpiredEvents();
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true });
  }

  // Refunds: reverse the recorded payment, audit, downgrade invoice status
  // if it was fully paid via this charge. Stripe sends one charge.refunded
  // event per refund, including partials.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
    if (!paymentIntentId) {
      processedEvents.set(event.id, Date.now());
      return NextResponse.json({ received: true });
    }
    const payment = await db.payment.findFirst({
      where: { transactionId: paymentIntentId, organizationId: orgId },
      include: { invoice: true },
    });
    if (payment) {
      const refundedTotal = (charge.amount_refunded ?? 0) / 100;
      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Invoice",
        entityId: payment.invoiceId,
        entityLabel: `Invoice #${payment.invoice.number}`,
        diff: { event: "stripe_refund", amountRefunded: refundedTotal, transactionId: paymentIntentId },
        organizationId: orgId,
      });
      // If the full charge has been refunded, flip the invoice back to SENT
      // so the org sees it as outstanding again. Partial refunds leave status
      // alone — accounting can issue a credit note instead.
      if ((charge.amount_refunded ?? 0) >= (charge.amount ?? 0) && payment.invoice.status === InvoiceStatus.PAID) {
        await db.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: InvoiceStatus.SENT },
        });
      }
    }
    processedEvents.set(event.id, Date.now());
    return NextResponse.json({ received: true });
  }

  // Disputes: never auto-mutate the invoice — disputes can be lost and
  // re-charged. Just log so admins see it in the audit trail and can react.
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntentId = typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
    if (paymentIntentId) {
      const payment = await db.payment.findFirst({
        where: { transactionId: paymentIntentId, organizationId: orgId },
        select: { invoiceId: true, invoice: { select: { number: true } } },
      });
      if (payment) {
        await logAudit({
          action: "STATUS_CHANGED",
          entityType: "Invoice",
          entityId: payment.invoiceId,
          entityLabel: `Invoice #${payment.invoice.number}`,
          diff: {
            event: "stripe_dispute_created",
            reason: dispute.reason,
            amount: (dispute.amount ?? 0) / 100,
            disputeId: dispute.id,
          },
          organizationId: orgId,
        });
      }
    }
    processedEvents.set(event.id, Date.now());
    return NextResponse.json({ received: true });
  }

  // Payment failed / canceled: log so the org sees why a checkout didn't
  // result in a payment. No invoice status change — a draft/sent invoice
  // stays unpaid until a successful charge lands.
  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = intent.metadata?.invoiceId;
    if (invoiceId) {
      const invoice = await db.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        select: { number: true },
      });
      if (invoice) {
        await logAudit({
          action: "STATUS_CHANGED",
          entityType: "Invoice",
          entityId: invoiceId,
          entityLabel: `Invoice #${invoice.number}`,
          diff: {
            event: event.type,
            failureMessage: intent.last_payment_error?.message ?? null,
            failureCode: intent.last_payment_error?.code ?? null,
          },
          organizationId: orgId,
        });
      }
    }
    processedEvents.set(event.id, Date.now());
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

    // Credit client balance for deposit invoices (full payment only)
    if (!partialPaymentId && invoice.type === InvoiceType.DEPOSIT) {
      await db.client.update({
        where: { id: invoice.clientId },
        data: { creditBalance: { increment: invoice.total } },
      });
    }

    // Save Stripe Customer ID on the client for future auto-charges
    const clientId = session.metadata?.clientId;
    const customerId = session.customer as string | null;
    if (clientId && customerId) {
      await db.client.update({
        where: { id: clientId, organizationId: orgId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Save card details to SavedPaymentMethod for display on the pay page
    try {
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
      if (paymentIntentId && clientId) {
        const stripeClient = getStripeClient(config.secretKey);
        await saveStripeCard({
          stripeClient,
          paymentIntentId,
          clientId,
          organizationId: orgId,
        });
      }
    } catch (err) {
      console.error("Failed to save card details:", err);
      // Non-critical — don't fail the webhook
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

    // Promote Stripe Tax calculation → transaction so the tax shows in
    // Stripe's filing reports. Idempotent and non-fatal: a failed promotion
    // doesn't unwind the payment we just recorded.
    try {
      const { promoteStripeTaxCalculation } = await import(
        "@/server/services/stripe-tax-transaction"
      );
      const stripeClient = getStripeClient(config.secretKey);
      const result = await promoteStripeTaxCalculation({
        db,
        stripe: stripeClient,
        invoiceId,
        reference: invoice.number,
      });
      if (!result.transactionId && result.reason) {
        console.error("[stripe-webhook] Tax promotion skipped:", result.reason);
      }
    } catch (err) {
      console.error("[stripe-webhook] Tax promotion threw:", err);
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
