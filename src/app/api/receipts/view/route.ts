import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { createReceiptSignedUrl } from "@/lib/supabase-storage";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Receipt paths are `${orgId}/${uuid}.${ext}` — the prefix check keeps one
  // org's members from viewing another org's receipts.
  if (!path.startsWith(`${orgId}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = await createReceiptSignedUrl(path);
  if (!signedUrl) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 302);
}
