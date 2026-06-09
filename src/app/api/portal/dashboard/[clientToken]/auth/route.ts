import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  generateSessionToken,
  SESSION_DURATION_MS,
} from "@/server/services/portal-dashboard";
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
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;

  if (limiter.isLimited(clientToken)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const retryAfter = lockout.retryAfterSeconds(clientToken);
  if (retryAfter !== null) {
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

  if (!client) {
    // Burn a bcrypt compare so timing doesn't reveal client existence.
    await burnBcryptCompare(passphrase);
    return NextResponse.json(GENERIC_PORTAL_AUTH_ERROR, { status: 401 });
  }

  const storedHash = client.portalPassphraseHash;

  if (storedHash) {
    const match = await bcrypt.compare(passphrase, storedHash);
    if (!match) {
      lockout.recordFailure(clientToken);
      return NextResponse.json(GENERIC_PORTAL_AUTH_ERROR, { status: 401 });
    }
  } else {
    // No passphrase configured — still pay the bcrypt cost to keep timing flat.
    await burnBcryptCompare(passphrase);
  }

  lockout.reset(clientToken);

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
