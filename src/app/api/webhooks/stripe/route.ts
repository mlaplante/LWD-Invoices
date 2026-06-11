import { NextRequest } from "next/server";
import { webhookJson } from "@/lib/webhook-response";
import { db } from "@/server/db";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import type Stripe from "stripe";
import { logAudit } from "@/server/services/audit";
import { sendPaymentReceiptEmail } from "@/server/services/payment-receipt-email";
import { saveStripeCard } from "@/server/services/save-stripe-card";
import { getStripeClient } from "@/server/services/stripe";
import { validateStripeWebhook } from "@/server/services/stripe-webhook-validator";
import { markProcessed, wasProcessed } from "@/server/services/webhook-dedup";

// Track processed Stripe event IDs to prevent duplicate processing.
// Entries auto-expire after 24 hours. The in-memory map is the fast path for
// same-instance retries; the WebhookDelivery table (webhook-dedup service)
// makes the skip hold across replicas. The DB transaction below remains
// idempotent as the last line of defense.
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 24 * 60 * 60_000;

function cleanExpiredEvents() {
  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > EVENT_TTL_MS) processedEvents.delete(id);
  }
}

// Record a fully-processed event in memory + the cross-instance ledger, and
// ack to Stripe. Marking happens only after processing so a handler that threw
// gets re-run on Stripe's retry.
async function ackProcessed(eventId: string) {
  processedEvents.set(eventId, Date.now());
  await markProcessed(db, "stripe", eventId);
  return webhookJson({ received: true });
}

export async function POST(req: NextRequest) {
  const validated = await validateStripeWebhook(req);
  if (!validated.ok) return validated.response;
  const { event, orgId, config } = validated;

  // Idempotency: skip already-processed events (this instance, then any instance)
  cleanExpiredEvents();
  if (processedEvents.has(event.id) || (await wasProcessed(db, "stripe", event.id))) {
    return webhookJson({ received: true });
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
      return ackProcessed(event.id);
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
    // Sync first-class Refund rows (app-issued + dashboard-issued). Non-fatal.
    try {
      const { reconcileChargeRefunds } = await import("@/server/services/refunds");
      await reconcileChargeRefunds(db, orgId, charge);
    } catch (err) {
      console.error("[stripe-webhook] Refund reconcile failed:", err);
    }
    return ackProcessed(event.id);
  }

  // Disputes: never auto-mutate the invoice — disputes can be lost and
  // re-charged. Mirror the dispute into the Dispute table so it shows up in the
  // dispute management surface, and notify admins when it's new or changes state.
  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.funds_withdrawn" ||
    event.type === "charge.dispute.funds_reinstated"
  ) {
    const dispute = event.data.object as Stripe.Dispute;
    try {
      const { upsertDisputeFromStripe } = await import("@/server/services/disputes");
      const result = await upsertDisputeFromStripe(db, orgId, dispute);

      if (result.invoiceId) {
        await logAudit({
          action: "STATUS_CHANGED",
          entityType: "Invoice",
          entityId: result.invoiceId,
          entityLabel: result.invoiceNumber ? `Invoice #${result.invoiceNumber}` : "Invoice",
          diff: {
            event: event.type,
            reason: dispute.reason,
            amount: (dispute.amount ?? 0) / 100,
            disputeId: dispute.id,
            status: dispute.status,
          },
          organizationId: orgId,
        }).catch(() => {});
      }

      const { notifyOrgAdmins } = await import("@/server/services/notifications");
      const clientLabel = result.clientName ? `${result.clientName}'s ` : "";
      await notifyOrgAdmins(orgId, {
        type: result.isNew ? "DISPUTE_CREATED" : "DISPUTE_UPDATED",
        title: result.isNew
          ? `New dispute on ${clientLabel}payment`
          : `Dispute ${dispute.status.replace(/_/g, " ")}`,
        body: result.isNew
          ? `A ${((dispute.amount ?? 0) / 100).toFixed(2)} ${(dispute.currency ?? "usd").toUpperCase()} dispute was opened${result.invoiceNumber ? ` on invoice #${result.invoiceNumber}` : ""}. Respond before the evidence deadline.`
          : `Dispute${result.invoiceNumber ? ` on invoice #${result.invoiceNumber}` : ""} is now "${dispute.status.replace(/_/g, " ")}".`,
        link: `/disputes`,
      }).catch(() => {});
    } catch (err) {
      console.error("[stripe-webhook] Dispute upsert failed:", err);
    }
    return ackProcessed(event.id);
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
    return ackProcessed(event.id);
  }

  // A bank-debit checkout (ACH / SEPA) completes before funds settle. Stripe
  // then sends async_payment_succeeded (record the payment) or
  // async_payment_failed (surface to admins) days later.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;
    if (invoiceId) {
      const invoice = await db.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        select: { number: true, client: { select: { name: true } } },
      });
      if (invoice) {
        await logAudit({
          action: "STATUS_CHANGED",
          entityType: "Invoice",
          entityId: invoiceId,
          entityLabel: `Invoice #${invoice.number}`,
          diff: { event: event.type, sessionId: session.id },
          organizationId: orgId,
        });
        try {
          const { notifyOrgAdmins } = await import("@/server/services/notifications");
          await notifyOrgAdmins(orgId, {
            type: "INVOICE_OVERDUE",
            title: `Bank debit failed for Invoice #${invoice.number}`,
            body: `${invoice.client?.name ?? "The client"}'s bank payment did not clear. The invoice remains unpaid.`,
            link: `/invoices/${invoiceId}`,
          });
        } catch (err) {
          console.error("[stripe-webhook] async payment failure notify failed:", err);
        }
      }
    }
    return ackProcessed(event.id);
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;

    if (!invoiceId) {
      return webhookJson({ error: "Missing invoiceId" }, { status: 400 });
    }

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      include: { partialPayments: true, payments: true },
    });

    if (!invoice) {
      return webhookJson({ error: "Invoice not found" }, { status: 404 });
    }

    // Delayed-notification method still processing: don't record a payment
    // yet — async_payment_succeeded will land later and run the paid path.
    if (event.type === "checkout.session.completed" && session.payment_status === "unpaid") {
      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "Invoice",
        entityId: invoiceId,
        entityLabel: `Invoice #${invoice.number}`,
        diff: { event: "bank_debit_processing", sessionId: session.id },
        organizationId: orgId,
      });
      return ackProcessed(event.id);
    }

    const partialPaymentId = session.metadata?.partialPaymentId;

    // Idempotency: skip if fully paid AND no specific installment targeted
    if (invoice.status === InvoiceStatus.PAID && !partialPaymentId) {
      return webhookJson({ received: true });
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
  return ackProcessed(event.id);
}
