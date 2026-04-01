import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { GatewayType } from "@/generated/prisma";
import { decryptJson } from "@/server/services/encryption";
import {
  createCheckoutSession,
  getStripeClient,
} from "@/server/services/stripe";
import { headers } from "next/headers";

const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invoice = await db.invoice.findFirst({
    where: { portalToken: token },
    include: {
      currency: true,
      payments: { select: { amount: true } },
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

  const config = decryptJson<StripeConfig>(gatewaySetting.configJson);
  const stripeClient = getStripeClient(config.secretKey);

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

  const { url } = await createCheckoutSession({
    stripeClient,
    invoice: {
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
      currency: invoice.currency,
      portalToken: invoice.portalToken!,
      organizationId: invoice.organizationId,
    },
    surcharge: gatewaySetting.surcharge.toNumber(),
    appUrl,
    amountOverride: remaining,
    successUrl: `${appUrl}/pay/${token}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/pay/${token}`,
  });

  return NextResponse.redirect(url, 303);
}

function getAppUrl(hdrs: Headers): string {
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
