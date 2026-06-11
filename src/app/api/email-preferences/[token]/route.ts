import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  ALL_EMAIL_PREFERENCE_KINDS,
  EMAIL_PREFERENCE_KINDS,
  resolvePreferenceState,
  setEmailPreference,
} from "@/server/services/email-preferences";
import type { EmailPreferenceKind } from "@/generated/prisma";

// Tokens are unguessable 122-bit values, but cap probing anyway.
const limiter = createRateLimiter({ limit: 30, windowMs: 15 * 60_000 });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function findClient(token: string) {
  if (!token || token.length > 200) return null;
  return db.client.findUnique({
    where: { emailPreferencesToken: token },
    select: { id: true, name: true, organizationId: true, emailPreferences: true },
  });
}

/**
 * Public email-preferences endpoint behind the unguessable per-client token
 * embedded in email footers. Exposes only the org display name and the
 * preference toggles — never invoices, balances, or contact details.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (limiter.isLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const client = await findClient(token);
  if (!client) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  const org = await db.organization.findUnique({
    where: { id: client.organizationId },
    select: { name: true },
  });
  return NextResponse.json({
    orgName: org?.name ?? "",
    kinds: EMAIL_PREFERENCE_KINDS,
    preferences: resolvePreferenceState(client.emailPreferences),
  });
}

/**
 * Saves preference toggles. Two body shapes:
 * - `{ preferences: { [kind]: boolean } }` from the preferences page
 * - RFC 8058 one-click: form POST with `List-Unsubscribe=One-Click`, which
 *   mailbox providers send when the user clicks their built-in unsubscribe
 *   button — disables every non-transactional kind.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (limiter.isLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const client = await findClient(token);
  if (!client) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const updates: Partial<Record<EmailPreferenceKind, boolean>> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // One-click unsubscribe from the mailbox provider.
    const form = await req.formData().catch(() => null);
    if (form?.get("List-Unsubscribe") !== "One-Click") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    for (const kind of ALL_EMAIL_PREFERENCE_KINDS) updates[kind] = false;
  } else {
    let body: { preferences?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const prefs = body.preferences;
    if (!prefs || typeof prefs !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    for (const kind of ALL_EMAIL_PREFERENCE_KINDS) {
      const value = (prefs as Record<string, unknown>)[kind];
      if (typeof value === "boolean") updates[kind] = value;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }

  for (const [kind, enabled] of Object.entries(updates)) {
    await setEmailPreference({
      clientId: client.id,
      organizationId: client.organizationId,
      kind: kind as EmailPreferenceKind,
      enabled,
    });
  }

  return NextResponse.json({ ok: true });
}
