import { type NextRequest } from "next/server";
import { db } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
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

  let generateInvoicePDF: (typeof import("@/server/services/invoice-pdf"))["generateInvoicePDF"];
  try {
    const mod = await import("@/server/services/invoice-pdf");
    generateInvoicePDF = mod.generateInvoicePDF;
  } catch (err) {
    console.error("[PDF] Failed to load invoice-pdf module:", err);
    return new Response(
      `PDF module load failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  let buffer: Buffer;
  try {
    buffer = await generateInvoicePDF(invoice);
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
