import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { deleteFile } from "@/server/services/storage";
import type { UserRole } from "@/generated/prisma";

// Deleting financial documentation is a privileged mutation; a bare
// org-membership check let any member (including VIEWER) destroy attachments.
// Gate to the same roles that manage documents elsewhere.
const DELETE_ATTACHMENT_ROLES: UserRole[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId, user } = auth;

  // Resolve the caller's role for this org (getAuthenticatedOrg only confirms
  // membership), mirroring the receipt-OCR route's role gate.
  const dbUser = await db.user.findFirst({
    where: { supabaseId: user.id },
    select: { id: true },
  });
  const membership = dbUser
    ? await db.userOrganization.findUnique({
        where: { userId_organizationId: { userId: dbUser.id, organizationId: orgId } },
        select: { role: true },
      })
    : null;
  if (!membership || !DELETE_ATTACHMENT_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await db.attachment.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteFile(attachment.storageUrl);
  await db.attachment.delete({ where: { id, organizationId: org.id } });

  return NextResponse.json({ success: true });
}
