import { type NextRequest } from "next/server";
import { db } from "@/server/db";
import { getProposalFileSignedUrl } from "@/lib/supabase/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await db.invoice.findFirst({
    where: { portalToken: token, type: "ESTIMATE" },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: {
        include: { taxes: { include: { tax: true } } },
        orderBy: { sort: "asc" },
      },
      payments: { orderBy: { paidAt: "asc" } },
      partialPayments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) {
    return new Response("Not Found", { status: 404 });
  }

  const proposal = await db.proposalContent.findFirst({
    where: { invoiceId: invoice.id },
  });

  if (!proposal) {
    return new Response("No proposal", { status: 404 });
  }

  // If an uploaded file exists, redirect to signed URL
  if (proposal.fileUrl) {
    const signedUrl = await getProposalFileSignedUrl(proposal.fileUrl);
    return Response.redirect(signedUrl, 302);
  }

  let generateProposalPDF: (typeof import("@/server/services/proposal-pdf"))["generateProposalPDF"];
  try {
    const mod = await import("@/server/services/proposal-pdf");
    generateProposalPDF = mod.generateProposalPDF;
  } catch (err) {
    console.error("[PDF] Failed to load proposal-pdf module:", err);
    return new Response(
      `PDF module load failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  let buffer: Buffer;
  try {
    buffer = await generateProposalPDF(invoice, proposal);
  } catch (err) {
    console.error("[PDF] generateProposalPDF failed:", err);
    return new Response(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  const arrayBuffer = buffer.buffer instanceof ArrayBuffer
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer.buffer;

  return new Response(arrayBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposal-${invoice.number}.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
