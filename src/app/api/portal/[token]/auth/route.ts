import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { signPortalSession } from "@/lib/portal-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json() as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { client: { select: { portalPassphraseHash: true } } },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storedHash = invoice.client?.portalPassphraseHash ?? null;

  if (!storedHash) {
    // No passphrase set — no auth needed
    return NextResponse.json({ ok: true });
  }

  const match = await bcrypt.compare(passphrase, storedHash);

  if (!match) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

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
