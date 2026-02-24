import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { deleteFile } from "@/server/services/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const org = await db.organization.findFirst({ where: { clerkId: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await db.attachment.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteFile(attachment.storageUrl);
  await db.attachment.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
