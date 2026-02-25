import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType, InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { verifyPayPalWebhook } from "@/server/services/paypal";
import type { PayPalConfig } from "@/server/services/gateway-config";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let payload: {
    event_type?: string;
    resource?: {
      custom_id?: string;
      id?: string;
      amount?: { value?: string };
    };
  };

  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract orgId and invoiceId from custom_id
  const customId = payload?.resource?.custom_id;
  if (!customId) {
    return NextResponse.json({ error: "Missing custom_id" }, { status: 400 });
  }

  let invoiceId: string;
  let orgId: string;
  try {
    const parsed = JSON.parse(customId) as { invoiceId: string; orgId: string };
    invoiceId = parsed.invoiceId;
    orgId = parsed.orgId;
  } catch {
    return NextResponse.json({ error: "Invalid custom_id format" }, { status: 400 });
  }

  const gateway = await db.gatewaySetting.findUnique({
    where: {
      organizationId_gatewayType: {
        organizationId: orgId,
        gatewayType: GatewayType.PAYPAL,
      },
    },
  });

  if (!gateway?.isEnabled) {
    return NextResponse.json({ error: "PayPal not configured for org" }, { status: 400 });
  }

  let config: PayPalConfig;
  try {
    config = decryptJson<PayPalConfig>(gateway.configJson);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt config" }, { status: 500 });
  }

  // Verify webhook signature
  const headers: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    headers[key.toLowerCase()] = val;
  });

  const isValid = await verifyPayPalWebhook(config, headers, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (payload.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, organizationId: orgId },
      select: { id: true, total: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Idempotency: already processed (PayPal may retry webhooks)
    if (invoice.status === InvoiceStatus.PAID) {
      return NextResponse.json({ received: true });
    }

    const capturedAmount = parseFloat(payload.resource?.amount?.value ?? "0");
    const invoiceTotal = invoice.total.toNumber();
    const surchargeAmount = Math.max(0, capturedAmount - invoiceTotal);
    const transactionId = payload.resource?.id ?? "";

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          amount: invoiceTotal,
          surchargeAmount,
          method: "paypal",
          transactionId,
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
            amountPaid: capturedAmount.toFixed(2),
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
    } catch {
      // Email failure is non-fatal
    }
  }

  return NextResponse.json({ received: true });
}
