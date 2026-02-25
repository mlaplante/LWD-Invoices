import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { constructStripeEvent } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";
import type Stripe from "stripe";

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
      select: { id: true, total: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Idempotency: already processed (Stripe may retry webhooks)
    if (invoice.status === InvoiceStatus.PAID) {
      return NextResponse.json({ received: true });
    }

    const amountTotal = session.amount_total ?? 0;
    const invoiceTotal = invoice.total.toNumber();
    const chargedAmount = amountTotal / 100; // convert from cents
    const surchargeAmount = Math.max(0, chargedAmount - invoiceTotal);

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          amount: invoiceTotal,
          surchargeAmount,
          method: "stripe",
          transactionId: session.payment_intent as string | undefined ?? session.id,
          invoiceId,
          organizationId: orgId,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId, organizationId: orgId },
        data: { status: InvoiceStatus.PAID },
      });
    });

    // Send payment receipt email
    try {
      const fullInvoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: { client: true, organization: true, currency: true },
      });

      if (fullInvoice?.client.email) {
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { PaymentReceiptEmail } = await import("@/emails/PaymentReceiptEmail");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = await render(
          PaymentReceiptEmail({
            invoiceNumber: fullInvoice.number,
            clientName: fullInvoice.client.name,
            amountPaid: chargedAmount.toFixed(2),
            currencySymbol: fullInvoice.currency.symbol,
            orgName: fullInvoice.organization.name,
            paidAt: new Date().toLocaleDateString(),
          })
        );

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: fullInvoice.client.email,
          subject: `Payment received — Invoice #${fullInvoice.number}`,
          html,
        });
      }
    } catch (err) {
      console.error("[stripe-webhook] Failed to send payment receipt email:", err);
    }
  }

  return NextResponse.json({ received: true });
}
