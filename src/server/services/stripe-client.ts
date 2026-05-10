import "server-only";
import type Stripe from "stripe";
import { GatewayType, type PrismaClient } from "@/generated/prisma";
import { decryptJson } from "./encryption";
import { getStripeClient } from "./stripe";
import type { StripeConfig } from "./gateway-config";

/**
 * Returns the org's Stripe client + decrypted config, or null when no Stripe
 * gateway is enabled for the org. Centralizes the lookup-decrypt-instantiate
 * pattern that's currently inlined in portal.ts and gatewaySettings.ts.
 */
export async function getStripeClientForOrg(
  db: PrismaClient,
  orgId: string,
): Promise<{ stripe: Stripe; config: StripeConfig } | null> {
  const gateway = await db.gatewaySetting.findFirst({
    where: {
      organizationId: orgId,
      gatewayType: GatewayType.STRIPE,
      isEnabled: true,
    },
  });
  if (!gateway) return null;

  const config = decryptJson<StripeConfig>(gateway.configJson);
  return { stripe: getStripeClient(config.secretKey), config };
}
