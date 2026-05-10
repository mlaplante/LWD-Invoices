import { type NextRequest } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { fullInvoiceInclude } from "@/server/services/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  const { id } = await params;

  const invoice = await db.invoice.findUnique({
    where: { id, organizationId: orgId },
    include: fullInvoiceInclude,
  });

  if (!invoice) {
    return new Response("Not Found", { status: 404 });
  }

  let buffer: Buffer;
  try {
    const { getOrRenderInvoicePDF } = await import("@/server/services/invoice-pdf-cache");
    buffer = await getOrRenderInvoicePDF(invoice);
  } catch (err) {
    console.error("[PDF] generateInvoicePDF failed:", err);
    return new Response(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Copy into a clean ArrayBuffer to avoid SharedArrayBuffer ambiguity
  const arrayBuffer = buffer.buffer instanceof ArrayBuffer
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer.buffer;

  return new Response(arrayBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.number}.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
