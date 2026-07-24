import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { createW9SignedUrl } from "@/lib/supabase-storage";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

/**
 * Stream a contractor's stored W-9 by redirecting to a short-lived signed URL.
 * The document lives in a private bucket, so access always goes through this
 * org-scoped, authenticated route — the path is never publicly guessable.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId, user } = auth;

  // W-9s carry unredacted SSN/EIN — same admin-only bar as
  // contractors.revealTin (requireRole("OWNER", "ADMIN")). Org membership
  // alone (proven above) is not sufficient; VIEWER/ACCOUNTANT must not mint
  // a signed URL to the document.
  const membership = await db.userOrganization.findFirst({
    where: { organizationId: orgId, user: { supabaseId: user.id } },
    select: { role: true },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const contractor = await db.contractor.findFirst({
    where: { id, organizationId: orgId },
    select: { w9DocumentPath: true },
  });
  if (!contractor?.w9DocumentPath) {
    return NextResponse.json({ error: "No W-9 on file" }, { status: 404 });
  }

  const signedUrl = await createW9SignedUrl(contractor.w9DocumentPath, 60);
  if (!signedUrl) {
    return NextResponse.json({ error: "Could not generate download link" }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl);
}
