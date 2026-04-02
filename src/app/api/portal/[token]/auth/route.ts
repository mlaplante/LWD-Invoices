import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { signPortalSession } from "@/lib/portal-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createRateLimiter } from "@/lib/rate-limit";

// 10 attempts per token per 15 minutes
const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

// Lockout: 5 failed attempts → locked for 15 minutes
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Rate limit by token
  if (authLimiter.isLimited(token)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  // Check lockout
  const lockout = failedAttempts.get(token);
  if (lockout && lockout.count >= MAX_FAILURES && Date.now() < lockout.lockedUntil) {
    const retryAfter = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = await req.json() as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { client: { select: { portalPassphraseHash: true } } },
  });

  // Always run bcrypt to prevent timing attacks (constant time regardless of found/not found)
  const storedHash = invoice?.client?.portalPassphraseHash ?? null;
  const dummyHash = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

  if (!invoice) {
    await bcrypt.compare(passphrase, dummyHash);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!storedHash) {
    // No passphrase set — no auth needed
    return NextResponse.json({ ok: true });
  }

  const match = await bcrypt.compare(passphrase, storedHash);

  if (!match) {
    // Track failed attempt
    const current = failedAttempts.get(token) ?? { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= MAX_FAILURES) {
      current.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    failedAttempts.set(token, current);

    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  // Success — reset failed attempts
  failedAttempts.delete(token);

  // Set HttpOnly cookie with a signed session token (not the hash itself)
  const sessionVal = signPortalSession(token, env.SUPABASE_SERVICE_ROLE_KEY);
  const cookieStore = await cookies();
  cookieStore.set(`portal_auth_${token}`, sessionVal, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: `/portal/${token}`,
  });

  return NextResponse.json({ ok: true });
}
