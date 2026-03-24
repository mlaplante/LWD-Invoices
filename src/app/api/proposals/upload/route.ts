import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { uploadProposalFile, deleteProposalFile } from "@/lib/supabase/storage";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const invoiceId = formData.get("invoiceId") as string | null;

  if (!file || !invoiceId) {
    return NextResponse.json(
      { error: "file and invoiceId are required" },
      { status: 400 }
    );
  }

  // Verify invoice is an ESTIMATE owned by this org
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: orgId, type: "ESTIMATE" },
  });
  if (!invoice) {
    return NextResponse.json(
      { error: "Estimate not found" },
      { status: 404 }
    );
  }

  let path: string;
  let fileName: string;
  try {
    const result = await uploadProposalFile(orgId, invoiceId, file);
    path = result.path;
    fileName = result.fileName;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }

  // Upsert ProposalContent: create if not exists, update if exists
  const existing = await db.proposalContent.findFirst({
    where: { invoiceId, organizationId: orgId },
  });

  let proposal;
  if (existing) {
    // If switching from editor mode, clean up old file if different path
    if (existing.fileUrl && existing.fileUrl !== path) {
      await deleteProposalFile(existing.fileUrl);
    }
    proposal = await db.proposalContent.update({
      where: { id: existing.id },
      data: {
        fileUrl: path,
        fileName,
        sections: [], // Clear editor sections
        templateId: null,
      },
    });
  } else {
    proposal = await db.proposalContent.create({
      data: {
        invoiceId,
        organizationId: orgId,
        fileUrl: path,
        fileName,
        sections: [],
      },
    });
  }

  return NextResponse.json(proposal);
}
