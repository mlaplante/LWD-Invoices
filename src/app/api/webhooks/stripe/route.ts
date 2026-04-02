import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { constructStripeEvent } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";
import type Stripe from "stripe";
import { getOwnerBcc } from "@/server/services/email-bcc";

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

    // Send payment receipt email
    try {
      const fullInvoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: { client: true, organization: true, currency: true, partialPayments: true },
      });

      if (fullInvoice?.client.email) {
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { PaymentReceiptEmail } = await import("@/emails/PaymentReceiptEmail");
        const resend = new Resend(process.env.RESEND_API_KEY);

        // Calculate installment info if partial payments exist
        let installmentNumber: number | undefined;
        let totalInstallments: number | undefined;
        let remainingBalance: string | undefined;

        if (fullInvoice.partialPayments && fullInvoice.partialPayments.length > 0) {
          const sortedPayments = fullInvoice.partialPayments.sort((a, b) => a.sortOrder - b.sortOrder);
          totalInstallments = sortedPayments.length;

          // Find which installment was just paid
          if (partialPaymentId) {
            const paidInstallmentIndex = sortedPayments.findIndex(pp => pp.id === partialPaymentId);
            if (paidInstallmentIndex !== -1) {
              installmentNumber = paidInstallmentIndex + 1;
            }
          }

          // Calculate remaining balance
          const totalInvoiceAmount = fullInvoice.total.toNumber();
          const totalPaid = sortedPayments
            .filter(pp => pp.isPaid)
            .reduce((sum, pp) => {
              const amount = pp.isPercentage
                ? (pp.amount.toNumber() / 100) * totalInvoiceAmount
                : pp.amount.toNumber();
              return sum + amount;
            }, 0);

          const remaining = totalInvoiceAmount - totalPaid;
          if (remaining > 0.01) { // Only show if more than 1 cent remaining
            remainingBalance = remaining.toFixed(2);
          }
        }

        const html = await render(
          PaymentReceiptEmail({
            invoiceNumber: fullInvoice.number,
            clientName: fullInvoice.client.name,
            amountPaid: chargedAmount.toFixed(2),
            currencySymbol: fullInvoice.currency.symbol,
            orgName: fullInvoice.organization.name,
            paidAt: new Date().toLocaleDateString(),
            portalLink: fullInvoice.portalToken
              ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${fullInvoice.portalToken}`
              : undefined,
            logoUrl: fullInvoice.organization.logoUrl ?? undefined,
            installmentNumber,
            totalInstallments,
            remainingBalance,
          })
        );

        const bcc = await getOwnerBcc(orgId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: fullInvoice.client.email,
          subject: `Payment received — Invoice #${fullInvoice.number}`,
          html,
          ...(bcc ? { bcc } : {}),
        });
      }
    } catch (err) {
      console.error("[stripe-webhook] Failed to send payment receipt email:", err);
    }
  }

  return NextResponse.json({ received: true });
}
