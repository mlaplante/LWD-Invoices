import { db } from "@/server/db";
import { NextResponse, type NextRequest } from "next/server";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { getStripeClient } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";

const PAYABLE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const formData = await req.formData();
  const paymentMethodId = formData.get("paymentMethodId") as string | null;
  const partialPaymentId = formData.get("partialPaymentId") as string | null;

  if (!paymentMethodId) {
    return NextResponse.json({ error: "Missing payment method" }, { status: 400 });
  }

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      client: true,
      currency: true,
      organization: true,
      payments: { select: { amount: true } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice is not payable" }, { status: 400 });
  }

  if (!invoice.client.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
  }

  const savedCard = await db.savedPaymentMethod.findFirst({
    where: {
      stripePaymentMethodId: paymentMethodId,
      clientId: invoice.clientId,
      organizationId: invoice.organizationId,
    },
  });

  if (!savedCard) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const gatewaySetting = await db.gatewaySetting.findFirst({
    where: { organizationId: invoice.organizationId, gatewayType: GatewayType.STRIPE, isEnabled: true },
  });

  if (!gatewaySetting) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const config = decryptJson<StripeConfig>(gatewaySetting.configJson);
  const stripeClient = getStripeClient(config.secretKey);

  const total = invoice.total.toNumber();
  const paidSum = invoice.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
  let chargeAmount: number;

  if (partialPaymentId) {
    const installment = invoice.partialPayments.find((pp) => pp.id === partialPaymentId);
    if (!installment || installment.isPaid) {
      return NextResponse.json({ error: "Installment not found or already paid" }, { status: 400 });
    }
    chargeAmount = installment.isPercentage
      ? total * Number(installment.amount) / 100
      : Number(installment.amount);
  } else {
    chargeAmount = total - paidSum;
  }

  if (chargeAmount <= 0) {
    return NextResponse.json({ error: "Nothing to charge" }, { status: 400 });
  }

  const surcharge = gatewaySetting.surcharge.toNumber();
  const finalAmount = chargeAmount * (1 + surcharge / 100);
  const amountCents = Math.round(finalAmount * 100);

  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountCents,
      currency: invoice.currency.code.toLowerCase(),
      customer: invoice.client.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        invoiceId: invoice.id,
        orgId: invoice.organizationId,
        portalToken: invoice.portalToken,
        clientId: invoice.clientId,
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Payment failed" }, { status: 402 });
    }

    const surchargeAmount = finalAmount - chargeAmount;
    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          amount: chargeAmount,
          gatewayFee: 0,
          surchargeAmount: surchargeAmount > 0 ? surchargeAmount : 0,
          method: "STRIPE",
          transactionId: paymentIntent.id,
          paidAt: new Date(),
        },
      });

      if (partialPaymentId) {
        await tx.partialPayment.update({
          where: { id: partialPaymentId },
          data: { isPaid: true },
        });
      }

      const allPayments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        select: { amount: true },
      });
      const totalPaid = allPayments.reduce((s, p) => s + p.amount.toNumber(), 0);
      const newStatus = totalPaid >= total ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });
    });

    const { sendPaymentReceiptEmail } = await import("@/server/services/payment-receipt-email");
    sendPaymentReceiptEmail({
      invoiceId: invoice.id,
      amountPaid: chargeAmount,
      organizationId: invoice.organizationId,
      partialPaymentId: partialPaymentId ?? undefined,
    }).catch((err) => console.error("Receipt email failed:", err));

    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return NextResponse.redirect(
      `${proto}://${host}/portal/${invoice.portalToken}/payment-success`,
      303
    );
  } catch (err: unknown) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError.type === "StripeCardError") {
      return NextResponse.json({ error: stripeError.message ?? "Card declined" }, { status: 402 });
    }
    console.error("Charge failed:", err);
    return NextResponse.json({ error: "Payment failed" }, { status: 500 });
  }
}
