import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { createReceiptSignedUrl } from "@/lib/supabase-storage";
import { isReceiptPathForOrg } from "@/lib/receipt-path";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Receipt paths are exactly `${orgId}/${uuid}.${ext}` (see uploadReceipt).
  // A bare prefix check is not enough: the storage client concatenates the
  // path into a URL and fetch() collapses dot segments, so
  // `${orgId}/../../proposals/<otherOrg>/…` would pass a startsWith() test and
  // then resolve to another bucket and another org's files. Require the full
  // shape — one org segment, one file segment, nothing else.
  if (!isReceiptPathForOrg(path, orgId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = await createReceiptSignedUrl(path);
  if (!signedUrl) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 302);
}
