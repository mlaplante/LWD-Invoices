import Stripe from "stripe";
import type { Prisma } from "@/generated/prisma";
type Decimal = Prisma.Decimal;

export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
}

export async function createCheckoutSession(opts: {
  stripeClient: Stripe;
  invoice: {
    id: string;
    number: string;
    total: Decimal;
    currency: { code: string };
    portalToken: string;
    organizationId: string;
    clientId: string;
  };
  surcharge: number;
  appUrl: string;
  partialPaymentId?: string;
  amountOverride?: number;
  successUrl?: string;
  cancelUrl?: string;
  clientEmail?: string | null;
  clientName?: string;
  stripeCustomerId?: string | null;
}): Promise<{ url: string; sessionId: string; customerId: string | undefined }> {
  const { stripeClient, invoice, surcharge, appUrl, partialPaymentId, amountOverride, successUrl, cancelUrl } = opts;

  const baseAmount = amountOverride ?? invoice.total.toNumber();
  const chargedAmount = baseAmount * (1 + surcharge / 100);
  // Stripe expects amount in smallest currency unit (cents)
  const amountCents = Math.round(chargedAmount * 100);

  const itemName = partialPaymentId
    ? `Invoice #${invoice.number} — Installment`
    : `Invoice #${invoice.number}`;

  let customer: string | undefined;
  if (opts.stripeCustomerId) {
    customer = opts.stripeCustomerId;
  } else if (opts.clientEmail) {
    const newCustomer = await stripeClient.customers.create({
      email: opts.clientEmail,
      name: opts.clientName,
      metadata: { orgId: invoice.organizationId },
    });
    customer = newCustomer.id;
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "payment",
    ...(customer ? { customer } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.code.toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: itemName,
          },
        },
      },
    ],
    payment_intent_data: {
      setup_future_usage: "off_session",
    },
    metadata: {
      invoiceId: invoice.id,
      orgId: invoice.organizationId,
      portalToken: invoice.portalToken,
      clientId: invoice.clientId,
      ...(partialPaymentId ? { partialPaymentId } : {}),
    },
    success_url: successUrl ?? `${appUrl}/portal/${invoice.portalToken}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl ?? `${appUrl}/portal/${invoice.portalToken}`,
  });

  if (!session.url) throw new Error("Stripe session URL missing");

  return { url: session.url, sessionId: session.id, customerId: customer };
}

export function constructStripeEvent(
  payload: string,
  sig: string,
  secret: string
): Stripe.Event {
  return Stripe.webhooks.constructEvent(payload, sig, secret);
}
