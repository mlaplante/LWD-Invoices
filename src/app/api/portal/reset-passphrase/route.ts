import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { logAudit } from "@/server/services/audit";
import { hashToken } from "@/lib/secure-token";
import { createRateLimiter } from "@/lib/rate-limit";

// Per-IP guard; the 256-bit token is unguessable, this just keeps the
// endpoint from being hammered.
const resetLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

const INVALID_LINK = { error: "This reset link is invalid or has expired." };

/**
 * Completes a portal passphrase reset: validates the emailed token, stores
 * the new bcrypt hash, burns the token, and revokes every existing portal
 * dashboard session for the client.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (resetLimiter.isLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let body: { token?: unknown; passphrase?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
  if (!token || token.length > 200) {
    return NextResponse.json(INVALID_LINK, { status: 400 });
  }
  // Mirrors the admin-side clientSchema passphrase rules (min 8, max 255).
  if (passphrase.length < 8 || passphrase.length > 255) {
    return NextResponse.json(
      { error: "Passphrase must be between 8 and 255 characters." },
      { status: 400 },
    );
  }

  const client = await db.client.findUnique({
    where: { portalPassphraseResetTokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      organizationId: true,
      portalToken: true,
      portalPassphraseResetExpiresAt: true,
    },
  });

  if (
    !client?.portalPassphraseResetExpiresAt ||
    client.portalPassphraseResetExpiresAt < new Date()
  ) {
    return NextResponse.json(INVALID_LINK, { status: 400 });
  }

  const portalPassphraseHash = await bcrypt.hash(passphrase, 12);

  await db.$transaction([
    db.client.update({
      where: { id: client.id },
      data: {
        portalPassphraseHash,
        portalPassphraseResetTokenHash: null,
        portalPassphraseResetExpiresAt: null,
      },
    }),
    // Revoke existing dashboard sessions — anyone holding the old
    // passphrase (or a stolen session) is signed out.
    db.clientPortalSession.deleteMany({ where: { clientId: client.id } }),
  ]);

  await logAudit({
    action: "UPDATED",
    entityType: "Client",
    entityId: client.id,
    entityLabel: client.name,
    diff: { event: "portal_passphrase_reset_completed" },
    userLabel: "Client portal",
    organizationId: client.organizationId,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    loginUrl: `/portal/dashboard-login/${client.portalToken}`,
  });
}
