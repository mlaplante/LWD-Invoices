import { db } from "@/server/db";
import Stripe from "stripe";

/**
 * Saves card details from a Stripe PaymentIntent to the SavedPaymentMethod table.
 * Idempotent — upserts by stripePaymentMethodId.
 */
export async function saveStripeCard({
  stripeClient,
  paymentIntentId,
  clientId,
  organizationId,
}: {
  stripeClient: Stripe;
  paymentIntentId: string;
  clientId: string;
  organizationId: string;
}): Promise<void> {
  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
  const pmId = typeof paymentIntent.payment_method === "string"
    ? paymentIntent.payment_method
    : paymentIntent.payment_method?.id;

  if (!pmId) return;

  const pm = await stripeClient.paymentMethods.retrieve(pmId);
  if (pm.type !== "card" || !pm.card) return;

  // Set all other cards for this client+org to non-default
  await db.savedPaymentMethod.updateMany({
    where: { clientId, organizationId, isDefault: true },
    data: { isDefault: false },
  });

  await db.savedPaymentMethod.upsert({
    where: { stripePaymentMethodId: pmId },
    create: {
      clientId,
      organizationId,
      stripePaymentMethodId: pmId,
      last4: pm.card.last4,
      brand: pm.card.brand,
      expiresMonth: pm.card.exp_month,
      expiresYear: pm.card.exp_year,
      isDefault: true,
    },
    update: {
      last4: pm.card.last4,
      brand: pm.card.brand,
      expiresMonth: pm.card.exp_month,
      expiresYear: pm.card.exp_year,
      isDefault: true,
    },
  });
}
