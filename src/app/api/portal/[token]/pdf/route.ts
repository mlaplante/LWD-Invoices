import { type NextRequest } from "next/server";
import { db } from "@/server/db";
import { fullInvoiceInclude } from "@/server/services/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
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

  const arrayBuffer = buffer.buffer instanceof ArrayBuffer
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer.buffer;

  return new Response(arrayBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${invoice.number}.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
