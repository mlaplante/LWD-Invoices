import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { createHash } from "crypto";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json() as { passphrase?: string };
  const passphrase = body.passphrase?.trim() ?? "";

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    select: { portalPassphraseHash: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!invoice.portalPassphraseHash) {
    // No passphrase set — no auth needed
    return NextResponse.json({ ok: true });
  }

  const hash = createHash("sha256").update(passphrase).digest("hex");

  if (hash !== invoice.portalPassphraseHash) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  // Set HttpOnly cookie
  const cookieStore = await cookies();
  cookieStore.set(`portal_auth_${token}`, hash, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: `/portal/${token}`,
  });

  return NextResponse.json({ ok: true });
}
