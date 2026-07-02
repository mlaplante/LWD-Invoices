import Stripe from "stripe";
import type { Prisma } from "@/generated/prisma";
type Decimal = Prisma.Decimal;

export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" });
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
  /**
   * Which payment method family this session offers. Card and bank debit are
   * separate sessions (not one session with both) because each carries its own
   * surcharge — Stripe Checkout can't price methods differently within a
   * session. Defaults to card.
   */
  paymentMethod?: "card" | "bank_debit";
  /** Org-level bank-debit toggles from StripeConfig; currency-gated below. */
  achDebitEnabled?: boolean;
  sepaDebitEnabled?: boolean;
  /**
   * Extra session metadata (e.g. the early-pay discount the webhook must
   * apply when this session settles). Values must be strings per Stripe.
   */
  extraMetadata?: Record<string, string>;
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

  // Bank debits cut fees on large invoices but each only works in its home
  // currency: us_bank_account (ACH) requires USD, sepa_debit requires EUR.
  // Both are delayed-notification methods — the webhook defers marking the
  // invoice paid until checkout.session.async_payment_succeeded.
  const paymentMethodTypes = resolvePaymentMethodTypes({
    paymentMethod: opts.paymentMethod ?? "card",
    currencyCode: invoice.currency.code,
    achDebitEnabled: opts.achDebitEnabled ?? false,
    sepaDebitEnabled: opts.sepaDebitEnabled ?? false,
  });
  if (paymentMethodTypes.length === 0) {
    throw new Error("Bank debit is not available for this invoice's currency or gateway settings");
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "payment",
    payment_method_types: paymentMethodTypes,
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
      // Carry attribution onto the PaymentIntent + Charge so dispute/refund
      // webhooks (whose objects lack our metadata) can be traced back to the org.
      metadata: {
        invoiceId: invoice.id,
        orgId: invoice.organizationId,
        clientId: invoice.clientId,
        ...(partialPaymentId ? { partialPaymentId } : {}),
      },
    },
    metadata: {
      invoiceId: invoice.id,
      orgId: invoice.organizationId,
      portalToken: invoice.portalToken,
      clientId: invoice.clientId,
      ...(partialPaymentId ? { partialPaymentId } : {}),
      ...(opts.extraMetadata ?? {}),
    },
    success_url: successUrl ?? `${appUrl}/portal/${invoice.portalToken}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl ?? `${appUrl}/portal/${invoice.portalToken}`,
  });

  if (!session.url) throw new Error("Stripe session URL missing");

  return { url: session.url, sessionId: session.id, customerId: customer };
}

/**
 * Map a method family to concrete Stripe payment_method_types for the
 * invoice's currency. Exported for the pay surfaces, which use it to decide
 * whether to render a bank-debit button at all (empty result = not offered).
 */
export function resolvePaymentMethodTypes(opts: {
  paymentMethod: "card" | "bank_debit";
  currencyCode: string;
  achDebitEnabled: boolean;
  sepaDebitEnabled: boolean;
}): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  if (opts.paymentMethod === "card") return ["card"];
  const currencyCode = opts.currencyCode.toLowerCase();
  const types: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = [];
  if (opts.achDebitEnabled && currencyCode === "usd") types.push("us_bank_account");
  if (opts.sepaDebitEnabled && currencyCode === "eur") types.push("sepa_debit");
  return types;
}

export function constructStripeEvent(
  payload: string,
  sig: string,
  secret: string
): Stripe.Event {
  return Stripe.webhooks.constructEvent(payload, sig, secret);
}
