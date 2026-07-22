import { db } from "@/server/db";
import { NextResponse, type NextRequest } from "next/server";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import { getStripeClient } from "@/server/services/stripe";
import type { StripeConfig } from "@/server/services/gateway-config";
import { safeErrorResponse } from "@/lib/api-errors";
import {
  earlyPayDiscountLabel,
  resolveEarlyPayOffer,
} from "@/server/services/early-payment-discount";
import { resolveAppUrlFromHeaders } from "@/lib/app-url";

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

  let config: StripeConfig;
  let stripeClient: ReturnType<typeof getStripeClient>;
  try {
    config = decryptJson<StripeConfig>(gatewaySetting.configJson);
    stripeClient = getStripeClient(config.secretKey);
  } catch (err) {
    return safeErrorResponse("Payment gateway unavailable", 500, {
      route: "pay/[token]/charge-saved",
      cause: err,
      meta: { orgId: invoice.organizationId },
    });
  }

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

  // Early-pay discount: same offer the checkout surfaces; this path records
  // the payment itself, so it also books the redemption below.
  const earlyPayOffer = partialPaymentId
    ? null
    : resolveEarlyPayOffer({
        percent: invoice.earlyPayDiscountPercent?.toNumber(),
        days: invoice.earlyPayDiscountDays,
        invoiceDate: invoice.date,
        status: invoice.status,
        total,
        paidSoFar: paidSum,
        hasInstallments: invoice.partialPayments.some((pp) => !pp.isPaid),
        redeemedAt: invoice.earlyPayDiscountRedeemedAt,
        now: new Date(),
      });
  if (earlyPayOffer) {
    chargeAmount = earlyPayOffer.discountedBalance;
  }

  if (chargeAmount <= 0) {
    return NextResponse.json({ error: "Nothing to charge" }, { status: 400 });
  }

  const surcharge = gatewaySetting.surcharge.toNumber();
  const finalAmount = chargeAmount * (1 + surcharge / 100);
  const amountCents = Math.round(finalAmount * 100);

  // Idempotency key, same protection the off-session autopay path already has:
  // if the DB write below fails after Stripe captured the money, the client sees
  // an error and retries — without this, that retry creates a SECOND
  // PaymentIntent and charges the card twice. Keyed on what makes a charge
  // distinct, so a genuinely different payment (other installment, changed
  // balance, different card) still goes through.
  const idempotencyKey = [
    "charge-saved",
    invoice.id,
    partialPaymentId ?? "balance",
    paymentMethodId,
    amountCents,
  ].join(":");

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
        // Marks this Intent as eligible for the payment_intent.succeeded
        // backstop: the payment is recorded inline below, so if that write
        // fails the webhook is the only thing left to record it.
        source: "charge_saved",
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
    }, { idempotencyKey });

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

      // Book the early-pay redemption: a post-tax FIXED_DISCOUNT line plus
      // cached-total adjustments, mirroring the Stripe-webhook path.
      if (earlyPayOffer) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            lineType: "FIXED_DISCOUNT",
            name: earlyPayDiscountLabel(
              earlyPayOffer.percent,
              invoice.earlyPayDiscountDays ?? 0,
            ),
            qty: 1,
            rate: earlyPayOffer.discountAmount,
            sort: 9999,
            subtotal: -earlyPayOffer.discountAmount,
            taxTotal: 0,
            total: -earlyPayOffer.discountAmount,
          },
        });
      }
      const effectiveTotal = earlyPayOffer
        ? total - earlyPayOffer.discountAmount
        : total;

      const allPayments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        select: { amount: true },
      });
      const totalPaid = allPayments.reduce((s, p) => s + p.amount.toNumber(), 0);
      const newStatus = totalPaid >= effectiveTotal ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: newStatus,
          ...(earlyPayOffer
            ? {
                discountTotal: { increment: earlyPayOffer.discountAmount },
                total: { decrement: earlyPayOffer.discountAmount },
                earlyPayDiscountRedeemedAt: new Date(),
                earlyPayDiscountAmount: earlyPayOffer.discountAmount,
              }
            : {}),
        },
      });
    });

    const { sendPaymentReceiptEmail } = await import("@/server/services/payment-receipt-email");
    sendPaymentReceiptEmail({
      invoiceId: invoice.id,
      amountPaid: chargeAmount,
      organizationId: invoice.organizationId,
      partialPaymentId: partialPaymentId ?? undefined,
    }).catch((err) => console.error("Receipt email failed:", err));

    return NextResponse.redirect(
      `${resolveAppUrlFromHeaders(req.headers)}/portal/${invoice.portalToken}/payment-success`,
      303
    );
  } catch (err: unknown) {
    // The (organizationId, transactionId) unique index rejected the insert, so
    // the payment_intent.succeeded backstop recorded this charge first. The
    // money is captured AND recorded — showing "Payment failed" here would push
    // the client into a retry, so treat it as the success it is.
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.redirect(
        `${resolveAppUrlFromHeaders(req.headers)}/portal/${invoice.portalToken}/payment-success`,
        303
      );
    }
    const stripeError = err as { type?: string; message?: string };
    // StripeCardError messages are user-safe by design (e.g. "Your card was declined").
    if (stripeError.type === "StripeCardError") {
      return NextResponse.json({ error: stripeError.message ?? "Card declined" }, { status: 402 });
    }
    return safeErrorResponse("Payment failed", 500, {
      route: "pay/[token]/charge-saved",
      cause: err,
      meta: { invoiceId: invoice.id },
    });
  }
}
