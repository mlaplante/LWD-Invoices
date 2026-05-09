import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/server/db";
import { GatewayType } from "@/generated/prisma";
import { decryptJson } from "./encryption";
import { constructStripeEvent } from "./stripe";
import type { StripeConfig } from "./gateway-config";
import { safeErrorResponse } from "@/lib/api-errors";

/**
 * Run every check that must succeed before the Stripe webhook handler
 * touches application state:
 *   1. raw body capture (signature verification needs exact bytes)
 *   2. orgId metadata pre-parse so we can look up the org's webhook secret
 *   3. gateway record lookup + decrypt
 *   4. Stripe signature verification
 *   5. cross-check that the verified event's orgId matches the pre-parsed one
 *
 * Returns either { ok: true, ... } with the verified event, or
 * { ok: false, response } with a NextResponse the caller should return.
 *
 * Error responses go through safeErrorResponse so signature/decryption
 * details are logged server-side but never echoed to the caller.
 */

type Result =
  | { ok: true; event: Stripe.Event; orgId: string; config: StripeConfig; rawBody: string }
  | { ok: false; response: NextResponse };

export async function validateStripeWebhook(req: NextRequest): Promise<Result> {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return { ok: false, response: NextResponse.json({ error: "Missing signature" }, { status: 400 }) };
  }

  let preEvent: { data?: { object?: { metadata?: Record<string, string> } } };
  try {
    preEvent = JSON.parse(rawBody) as typeof preEvent;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  const orgId = preEvent?.data?.object?.metadata?.orgId;
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing orgId in metadata" }, { status: 400 }),
    };
  }

  const gateway = await db.gatewaySetting.findUnique({
    where: {
      organizationId_gatewayType: { organizationId: orgId, gatewayType: GatewayType.STRIPE },
    },
  });
  if (!gateway?.isEnabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Stripe not configured for org" }, { status: 400 }),
    };
  }

  let config: StripeConfig;
  try {
    config = decryptJson<StripeConfig>(gateway.configJson);
  } catch (err) {
    return {
      ok: false,
      response: safeErrorResponse("Failed to decrypt config", 500, {
        route: "webhooks/stripe",
        cause: err,
        meta: { orgId },
      }),
    };
  }

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, sig, config.webhookSecret);
  } catch (err) {
    return {
      ok: false,
      response: safeErrorResponse("Invalid signature", 400, {
        route: "webhooks/stripe",
        cause: err,
        meta: { orgId },
      }),
    };
  }

  const verifiedOrgId = (event.data.object as { metadata?: Record<string, string> })?.metadata?.orgId;
  if (verifiedOrgId !== orgId) {
    return { ok: false, response: NextResponse.json({ error: "OrgId mismatch" }, { status: 400 }) };
  }

  return { ok: true, event, orgId, config, rawBody };
}
