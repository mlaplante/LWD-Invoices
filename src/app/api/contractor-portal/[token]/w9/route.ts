import { db } from "@/server/db";
import { uploadW9 } from "@/lib/supabase-storage";
import { NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/api-errors";

/**
 * Self-service W-9 upload from the contractor portal. Token-authenticated (no
 * org session): the portalToken resolves the contractor, access is gated on
 * portalEnabled, and the file lands in the same private bucket as the
 * admin-side upload. On success the W-9 status flips to RECEIVED.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const contractor = await db.contractor.findUnique({
      where: { portalToken: token },
      select: { id: true, organizationId: true, portalEnabled: true, isArchived: true },
    });
    if (!contractor || !contractor.portalEnabled || contractor.isArchived) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadW9(contractor.organizationId, contractor.id, file);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    await db.contractor.update({
      where: { id: contractor.id },
      data: {
        w9DocumentPath: result.path,
        w9Status: "RECEIVED",
        w9ReceivedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return safeErrorResponse("Upload failed", 500, {
      route: "contractor-portal/[token]/w9",
      cause: err,
    });
  }
}
