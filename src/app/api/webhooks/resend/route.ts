import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { db } from "@/server/db";

// Resend uses Svix to sign webhooks; verifying with the wrong secret throws.
// We capture the raw body once because signature verification needs exact bytes.

type ResendTag = { name: string; value: string };

type ResendPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    tags?: ResendTag[] | Record<string, string>;
    click?: { link?: string };
  };
};

function readOrgIdTag(tags: ResendTag[] | Record<string, string> | undefined): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    return tags.find((t) => t?.name === "org_id")?.value ?? null;
  }
  const v = tags.org_id;
  return typeof v === "string" ? v : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook is optional. If the secret isn't configured, return 503 so Resend
    // surfaces the misconfiguration in its dashboard rather than silently 200ing.
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let payload: ResendPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, headers) as ResendPayload;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const resendId = payload.data?.email_id;
  const type = payload.type;
  if (!resendId || !type) {
    // Acknowledge so Resend doesn't retry, but skip — nothing to record.
    return NextResponse.json({ ok: true });
  }

  const recipient = Array.isArray(payload.data?.to)
    ? payload.data?.to[0] ?? ""
    : payload.data?.to ?? "";
  const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();
  const link = payload.data?.click?.link ?? null;
  const orgId = readOrgIdTag(payload.data?.tags);

  await db.emailEvent.create({
    data: {
      resendId,
      type,
      occurredAt,
      recipient,
      link,
      organizationId: orgId,
    },
  });

  // Side-effects: mark the client as having delivery problems so future
  // sends can suppress and the UI can surface a warning. Best-effort —
  // failures here must not retry the webhook (the EmailEvent row is the
  // source of truth; this is denormalization for fast reads).
  if ((type === "email.bounced" || type === "email.complained") && orgId && recipient) {
    try {
      const field = type === "email.bounced" ? "emailBouncedAt" : "emailComplainedAt";
      await db.client.updateMany({
        where: { organizationId: orgId, email: recipient },
        data: { [field]: occurredAt },
      });
    } catch (err) {
      console.error("[resend-webhook] Failed to flag client deliverability:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
