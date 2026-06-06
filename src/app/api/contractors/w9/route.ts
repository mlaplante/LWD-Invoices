import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { uploadW9 } from "@/lib/supabase-storage";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

/**
 * Upload a signed W-9 PDF for a contractor. The file lands in a private bucket;
 * on success the contractor's W-9 status is flipped to RECEIVED and the storage
 * path is recorded. Served back only through the authenticated download route.
 */
export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedOrg();
    if (isAuthError(auth)) return auth;
    const { orgId } = auth;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const contractorId = formData.get("contractorId");
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (typeof contractorId !== "string" || !contractorId) {
      return NextResponse.json({ error: "contractorId is required" }, { status: 400 });
    }

    // Ensure the contractor belongs to the caller's org before storing anything.
    const contractor = await db.contractor.findFirst({
      where: { id: contractorId, organizationId: orgId },
      select: { id: true },
    });
    if (!contractor) {
      return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
    }

    const result = await uploadW9(orgId, contractorId, file);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    await db.contractor.update({
      where: { id: contractorId },
      data: {
        w9DocumentPath: result.path,
        w9Status: "RECEIVED",
        w9ReceivedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[w9 upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
