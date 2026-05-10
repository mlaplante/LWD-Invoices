import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  generateSessionToken,
  SESSION_DURATION_MS,
} from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createRateLimiter } from "@/lib/rate-limit";

// 10 attempts per clientToken per 15 minutes
const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

// Lockout: 5 failed attempts → locked for 15 minutes
type Attempt = { count: number; lockedUntil: number };
const failedAttempts = new Map<string, Attempt>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;
const MAX_TRACKED_TOKENS = 10_000;

// Bcrypt-format dummy hash used to keep request latency constant when the
// client/passphrase isn't found, preventing user enumeration via timing.
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

function pruneFailedAttempts() {
  if (failedAttempts.size < MAX_TRACKED_TOKENS) return;
  const now = Date.now();
  for (const [k, v] of failedAttempts) {
    if (v.lockedUntil < now && v.count < MAX_FAILURES) failedAttempts.delete(k);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;

  if (authLimiter.isLimited(clientToken)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const lockout = failedAttempts.get(clientToken);
  if (lockout && lockout.count >= MAX_FAILURES && Date.now() < lockout.lockedUntil) {
    const retryAfter = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = (await req.json()) as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: { id: true, portalPassphraseHash: true },
  });

  // Always run a bcrypt compare so response time doesn't reveal client existence.
  if (!client) {
    await bcrypt.compare(passphrase, DUMMY_HASH);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storedHash = client.portalPassphraseHash;

  if (storedHash) {
    const match = await bcrypt.compare(passphrase, storedHash);
    if (!match) {
      const current = failedAttempts.get(clientToken) ?? { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_FAILURES) {
        current.lockedUntil = Date.now() + LOCKOUT_MS;
      }
      failedAttempts.set(clientToken, current);
      pruneFailedAttempts();
      return NextResponse.json(
        { error: "Incorrect passphrase" },
        { status: 401 },
      );
    }
  } else {
    // No passphrase configured — still pay the bcrypt cost to keep timing flat.
    await bcrypt.compare(passphrase, DUMMY_HASH);
  }

  failedAttempts.delete(clientToken);

  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.clientPortalSession.create({
    data: {
      token: sessionToken,
      expiresAt,
      clientId: client.id,
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(`portal_dashboard_${clientToken}`, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    path: `/portal/dashboard/${clientToken}`,
  });

  return NextResponse.json({ ok: true });
}
