import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { createAttachmentSignedUrl } from "@/server/services/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const { id } = await params;
  const attachment = await db.attachment.findFirst({
    where: { id, organizationId: orgId },
    select: { storageUrl: true },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = await createAttachmentSignedUrl(attachment.storageUrl);
  if (!signedUrl) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl, 302);
}
