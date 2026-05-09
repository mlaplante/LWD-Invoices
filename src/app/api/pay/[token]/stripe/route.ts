import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import {
  createCheckoutSession,
  getStripeClient,
} from "@/server/services/stripe";
import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeErrorResponse } from "@/lib/api-errors";

// 10 payment attempts per token per 5 minutes
const payLimiter = createRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(request.url);
  const partialPaymentId = url.searchParams.get("partialPaymentId");

  if (payLimiter.isLimited(token)) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please try again later." },
      { status: 429 },
    );
  }

  const invoice = await db.invoice.findFirst({
    where: { portalToken: token },
    include: {
      currency: true,
      payments: { select: { amount: true } },
      partialPayments: true,
      client: { select: { email: true, name: true, stripeCustomerId: true } },
    },
  });

  if (!invoice || !PAYABLE_STATUSES.includes(invoice.status as (typeof PAYABLE_STATUSES)[number])) {
    return NextResponse.json(
      { error: "Invoice not found or not payable" },
      { status: 404 },
    );
  }

  const gatewaySetting = await db.gatewaySetting.findFirst({
    where: {
      organizationId: invoice.organizationId,
      gatewayType: GatewayType.STRIPE,
      isEnabled: true,
    },
  });

  if (!gatewaySetting) {
    return NextResponse.json(
      { error: "Stripe payment gateway is not configured" },
      { status: 400 },
    );
  }

  let config: StripeConfig;
  let stripeClient: ReturnType<typeof getStripeClient>;
  try {
    config = decryptJson<StripeConfig>(gatewaySetting.configJson);
    stripeClient = getStripeClient(config.secretKey);
  } catch (err) {
    return safeErrorResponse("Payment gateway unavailable", 500, {
      route: "pay/[token]/stripe",
      cause: err,
      meta: { orgId: invoice.organizationId },
    });
  }

  const totalPaid = invoice.payments.reduce(
    (sum, p) => sum + p.amount.toNumber(),
    0,
  );
  const remaining = invoice.total.toNumber() - totalPaid;

  const hdrs = await headers();
  const appUrl = getAppUrl(hdrs);

  if (remaining <= 0) {
    return NextResponse.redirect(new URL(`/pay/${token}`, appUrl), 303);
  }

  // Determine payment amount: installment or full remaining
  let payAmount = remaining;
  if (partialPaymentId) {
    const pp = invoice.partialPayments.find((p) => p.id === partialPaymentId);
    if (pp && !pp.isPaid) {
      payAmount = pp.isPercentage
        ? invoice.total.toNumber() * Number(pp.amount) / 100
        : Number(pp.amount);
    }
  }

  let checkoutUrl: string;
  try {
    const session = await createCheckoutSession({
      stripeClient,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: invoice.total,
        currency: invoice.currency,
        portalToken: invoice.portalToken!,
        organizationId: invoice.organizationId,
        clientId: invoice.clientId,
      },
      surcharge: gatewaySetting.surcharge.toNumber(),
      appUrl,
      partialPaymentId: partialPaymentId ?? undefined,
      amountOverride: payAmount,
      successUrl: `${appUrl}/pay/${token}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/pay/${token}`,
      clientEmail: invoice.client?.email,
      clientName: invoice.client?.name,
      stripeCustomerId: invoice.client?.stripeCustomerId,
    });
    checkoutUrl = session.url;
  } catch (err) {
    return safeErrorResponse("Could not start payment session", 502, {
      route: "pay/[token]/stripe",
      cause: err,
      meta: { invoiceId: invoice.id },
    });
  }

  return NextResponse.redirect(checkoutUrl, 303);
}

function getAppUrl(hdrs: Headers): string {
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
