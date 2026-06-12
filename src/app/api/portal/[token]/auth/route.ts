import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { getPortalSessionSecret, signPortalSession } from "@/lib/portal-session";
import {
  createPortalAuthGuard,
  burnBcryptCompare,
  GENERIC_PORTAL_AUTH_ERROR,
} from "@/lib/portal-auth";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const { limiter, lockout } = createPortalAuthGuard();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Rate limit by token
  if (limiter.isLimited(token)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  // Check lockout
  const retryAfter = lockout.retryAfterSeconds(token);
  if (retryAfter !== null) {
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

  if (!invoice) {
    // Burn a bcrypt compare so timing doesn't reveal token validity.
    await burnBcryptCompare(passphrase);
    return NextResponse.json(GENERIC_PORTAL_AUTH_ERROR, { status: 401 });
  }

  const storedHash = invoice.client?.portalPassphraseHash ?? null;
  if (!storedHash) {
    // No passphrase set — no auth needed
    return NextResponse.json({ ok: true });
  }

  const match = await bcrypt.compare(passphrase, storedHash);

  if (!match) {
    lockout.recordFailure(token);
    return NextResponse.json(GENERIC_PORTAL_AUTH_ERROR, { status: 401 });
  }

  // Success — reset failed attempts
  lockout.reset(token);

  // Set HttpOnly cookie with a signed session token (not the hash itself)
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  const sessionVal = signPortalSession(token, getPortalSessionSecret(), maxAge);
  const cookieStore = await cookies();
  cookieStore.set(`portal_auth_${token}`, sessionVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    // Path must cover both /portal/[token] pages and /api/portal/[token]/*
    // routes (estimate accept/decline, PDFs) — a /portal/[token] path means
    // the browser never sends the cookie to the API routes that verify it.
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
