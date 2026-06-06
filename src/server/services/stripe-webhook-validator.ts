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

  let preEvent: PreEvent;
  try {
    preEvent = JSON.parse(rawBody) as PreEvent;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  // Resolve which org this event belongs to. Most events carry orgId directly
  // in object metadata; dispute/refund events (Stripe Dispute / Charge objects)
  // don't, so we fall back to the related Payment. Either way the signature is
  // verified below with *that* org's secret, so a forged event can't pass.
  const orgId = await resolveWebhookOrgId(preEvent);
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Could not resolve org for event" }, { status: 400 }),
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

  // When the event object carries an orgId in metadata, cross-check it against
  // the org whose secret verified the signature. Events without metadata.orgId
  // (disputes/refunds) were resolved via the Payment lookup above and have
  // nothing to cross-check.
  const verifiedOrgId = (event.data.object as { metadata?: Record<string, string> })?.metadata?.orgId;
  if (verifiedOrgId && verifiedOrgId !== orgId) {
    return { ok: false, response: NextResponse.json({ error: "OrgId mismatch" }, { status: 400 }) };
  }

  return { ok: true, event, orgId, config, rawBody };
}

type PreEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      metadata?: Record<string, string>;
      payment_intent?: string | { id?: string } | null;
      charge?: string | { id?: string } | null;
    };
  };
};

/**
 * Determine the owning org for an incoming Stripe event. Tries object metadata
 * first (set on checkout sessions + payment intents), then falls back to the
 * related Payment for charge/dispute/refund events whose object carries no
 * metadata. Returns null when neither resolves.
 */
async function resolveWebhookOrgId(preEvent: PreEvent): Promise<string | null> {
  const obj = preEvent?.data?.object;
  const metaOrg = obj?.metadata?.orgId;
  if (typeof metaOrg === "string" && metaOrg) return metaOrg;
  if (!obj) return null;

  // Collect candidate transaction identifiers. Payment.transactionId stores the
  // PaymentIntent id, so that's the reliable join key; we also try the charge id.
  const candidates: string[] = [];
  const pi = obj.payment_intent;
  if (typeof pi === "string") candidates.push(pi);
  else if (pi && typeof pi === "object" && pi.id) candidates.push(pi.id);
  const charge = obj.charge;
  if (typeof charge === "string") candidates.push(charge);
  else if (charge && typeof charge === "object" && charge.id) candidates.push(charge.id);
  if (preEvent.type?.startsWith("charge.") && typeof obj.id === "string") {
    candidates.push(obj.id);
  }
  if (candidates.length === 0) return null;

  const payment = await db.payment.findFirst({
    where: { transactionId: { in: candidates } },
    select: { organizationId: true },
  });
  return payment?.organizationId ?? null;
}
