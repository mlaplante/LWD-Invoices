import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  generateSessionToken,
  SESSION_DURATION_MS,
} from "@/server/services/portal-dashboard";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;
  const body = (await req.json()) as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const client = await db.client.findUnique({
    where: { portalToken: clientToken },
    select: { id: true, portalPassphraseHash: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storedHash = client.portalPassphraseHash;

  // If passphrase is set, verify it
  if (storedHash) {
    const match = await bcrypt.compare(passphrase, storedHash);
    if (!match) {
      return NextResponse.json(
        { error: "Incorrect passphrase" },
        { status: 401 }
      );
    }
  }

  // Create a session in the database
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

  // Set httpOnly cookie scoped to this client's dashboard
  const cookieStore = await cookies();
  cookieStore.set(`portal_dashboard_${clientToken}`, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    path: `/portal/dashboard/${clientToken}`,
  });

  return NextResponse.json({ ok: true });
}
