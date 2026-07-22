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
import {
  computeEarlyPayRedemption,
  earlyPayDiscountLabel,
} from "@/server/services/early-payment-discount";

// Track processed Stripe event IDs to prevent duplicate processing.
// Entries auto-expire after 24 hours. The in-memory map is the fast path for
// same-instance retries; the WebhookDelivery table (webhook-dedup service)
// makes the skip hold across replicas. The DB transaction below remains
// idempotent as the last line of defense.
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 24 * 60 * 60_000;

// PaymentIntent metadata marker written at every creation site (see
// createCheckoutSession, charge-saved, attemptOffSessionCharge). Only
// off-session sources are eligible for the payment_intent.succeeded backstop
// below. An absent or unrecognised marker is skipped rather than recorded:
// failing to record leaves a visible, recoverable gap, whereas wrongly
// recording a checkout intent is silent data corruption.
const BACKSTOP_SOURCES = new Set(["charge_saved", "off_session"]);

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

  // Off-session charges (saved card on the portal, installment autopay, dunning
  // retries) record the payment inline, immediately after Stripe confirms the
  // charge. If that inline write fails — a DB blip, a timed-out Lambda — Stripe
  // has the money and nothing in the app will ever record it. This is the
  // backstop for that gap.
  //
  // It deliberately ignores checkout-originated intents. The
  // checkout.session.completed handler does strictly more than a PaymentIntent
  // event can reconstruct (early-pay discount redemption, deposit credit
  // balance, card save, Stripe Tax promotion) because the discount amount and
  // portal token live on the Session, not the Intent. Stripe does not guarantee
  // event ordering, so if this branch won the race it would mark the invoice
  // PAID and make the session handler short-circuit at its already-PAID check,
  // silently dropping all of that.
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = intent.metadata?.invoiceId;
    const source = intent.metadata?.source;

    if (!invoiceId || !BACKSTOP_SOURCES.has(source ?? "")) {
      return ackProcessed(event.id);
    }

    // The inline path writes transactionId = the PaymentIntent id, so this is
    // the authoritative "already handled" check regardless of arrival order.
    const alreadyRecorded = await db.payment.findFirst({
      where: { transactionId: intent.id, organizationId: orgId },
      select: { id: true },
    });
    if (alreadyRecorded) {
      return ackProcessed(event.id);
    }

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      include: { partialPayments: true, payments: true },
    });
    if (!invoice) {
      return webhookJson({ error: "Invoice not found" }, { status: 404 });
    }

    const chargedAmount = (intent.amount_received ?? intent.amount ?? 0) / 100;
    const invoiceTotal = invoice.total.toNumber();
    const existingTotal = invoice.payments.reduce(
      (sum, p) => sum + p.amount.toNumber(),
      0,
    );
    const partialPaymentId = intent.metadata?.partialPaymentId;

    let paymentAmount: number;
    let surchargeAmount: number;
    if (partialPaymentId) {
      const installment = invoice.partialPayments.find(
        (pp) => pp.id === partialPaymentId,
      );
      if (!installment || installment.isPaid) {
        return ackProcessed(event.id);
      }
      const installmentAmount = installment.isPercentage
        ? (installment.amount.toNumber() / 100) * invoiceTotal
        : installment.amount.toNumber();
      paymentAmount = Math.min(installmentAmount, chargedAmount);
      surchargeAmount = Math.max(0, chargedAmount - paymentAmount);
    } else {
      // Never credit more than Stripe actually captured. A charge smaller than
      // the outstanding balance means something the Intent doesn't carry shrank
      // it (an early-pay discount, booked by the inline path that failed), so
      // the invoice lands PARTIALLY_PAID and the notification below asks a human
      // to reconcile rather than this guessing at the discount.
      const remaining = invoiceTotal - existingTotal;
      paymentAmount = remaining > 0 ? Math.min(remaining, chargedAmount) : chargedAmount;
      surchargeAmount = Math.max(0, chargedAmount - paymentAmount);
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            amount: paymentAmount,
            surchargeAmount,
            method: "stripe",
            transactionId: intent.id,
            invoiceId,
            organizationId: orgId,
          },
        });

        if (partialPaymentId) {
          await tx.partialPayment.update({
            where: { id: partialPaymentId },
            data: {
              isPaid: true,
              paidAt: new Date(),
              paymentMethod: "stripe",
              transactionId: intent.id,
            },
          });
          const allPartials = await tx.partialPayment.findMany({ where: { invoiceId } });
          await tx.invoice.update({
            where: { id: invoiceId, organizationId: orgId },
            data: {
              status: allPartials.every((pp) => pp.isPaid)
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIALLY_PAID,
            },
          });
        } else {
          await tx.invoice.update({
            where: { id: invoiceId, organizationId: orgId },
            data: {
              status: existingTotal + paymentAmount >= invoiceTotal
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIALLY_PAID,
            },
          });
        }
      });
    } catch (err) {
      // Lost the race with the inline path between the existence check above and
      // the insert: the (organizationId, transactionId) unique index rejected the
      // duplicate, which means the payment IS recorded. Ack so Stripe stops
      // retrying an event that has nothing left to do.
      if ((err as { code?: string })?.code === "P2002") {
        return ackProcessed(event.id);
      }
      throw err;
    }

    await logAudit({
      action: "PAYMENT_RECEIVED",
      entityType: "Invoice",
      entityId: invoiceId,
      entityLabel: `Invoice #${invoice.number}`,
      diff: {
        method: "stripe",
        amount: paymentAmount,
        surchargeAmount,
        transactionId: intent.id,
        recoveredBy: "payment_intent_backstop",
        source,
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
      organizationId: orgId,
    }).catch(() => {});

    // Always tell a human: reaching this branch means an inline write failed,
    // which is worth investigating even though the money is now recorded.
    try {
      const { notifyOrgAdmins } = await import("@/server/services/notifications");
      await notifyOrgAdmins(orgId, {
        type: "INVOICE_PAID",
        title: `Recovered an unrecorded payment on Invoice #${invoice.number}`,
        body: `A ${chargedAmount.toFixed(2)} charge succeeded in Stripe but was never recorded by the app. It has been recorded now — please confirm the invoice balance is correct.`,
        link: `/invoices/${invoiceId}`,
      });
    } catch (err) {
      console.error("[stripe-webhook] Backstop notify failed:", err);
    }

    try {
      await sendPaymentReceiptEmail({
        invoiceId,
        amountPaid: chargedAmount,
        organizationId: orgId,
        partialPaymentId: partialPaymentId ?? undefined,
      });
    } catch (err) {
      console.error("[stripe-webhook] Backstop receipt email failed:", err);
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

        // Early-pay discount redemption: the checkout charged the discounted
        // balance (metadata written by createStripeCheckout). Book the
        // discount post-tax — append a FIXED_DISCOUNT line and shrink the
        // cached totals — so payments reconcile against the new total.
        const metaDiscount = parseFloat(session.metadata?.earlyPayDiscountAmount ?? "");
        const earlyPayDiscount =
          Number.isFinite(metaDiscount) &&
          metaDiscount > 0 &&
          !invoice.earlyPayDiscountRedeemedAt &&
          invoice.earlyPayDiscountPercent
            ? Math.min(metaDiscount, invoiceTotal - existingTotal)
            : 0;

        let paymentAmount: number;
        let surchargeAmount: number;
        if (earlyPayDiscount > 0) {
          const redemption = computeEarlyPayRedemption({
            invoiceTotal,
            existingPaid: existingTotal,
            discountAmount: earlyPayDiscount,
            chargedAmount,
          });
          paymentAmount = redemption.paymentAmount;
          surchargeAmount = redemption.surchargeAmount;

          const percent = invoice.earlyPayDiscountPercent?.toNumber() ?? 0;
          const days = invoice.earlyPayDiscountDays ?? 0;
          await tx.invoiceLine.create({
            data: {
              invoiceId,
              lineType: "FIXED_DISCOUNT",
              name: earlyPayDiscountLabel(percent, days),
              qty: 1,
              rate: earlyPayDiscount,
              sort: 9999,
              subtotal: -earlyPayDiscount,
              taxTotal: 0,
              total: -earlyPayDiscount,
            },
          });
        } else {
          paymentAmount = invoiceTotal - existingTotal;
          if (paymentAmount <= 0) paymentAmount = chargedAmount;
          surchargeAmount = Math.max(0, chargedAmount - paymentAmount);
        }

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
          data: {
            status: InvoiceStatus.PAID,
            ...(earlyPayDiscount > 0
              ? {
                  discountTotal: { increment: earlyPayDiscount },
                  total: { decrement: earlyPayDiscount },
                  earlyPayDiscountRedeemedAt: new Date(),
                  earlyPayDiscountAmount: earlyPayDiscount,
                }
              : {}),
          },
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
