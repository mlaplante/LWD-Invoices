import { type NextRequest } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { fullInvoiceInclude } from "@/server/lib/invoice-includes";

export async function GET(_req: NextRequest) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId } = auth;

  // Find the most recent invoice for this org, or build a sample
  const invoice = await db.invoice.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: fullInvoiceInclude,
  });

  if (!invoice) {
    return new Response(
      "No invoices found. Create an invoice first to preview templates.",
      { status: 404, headers: { "Content-Type": "text/plain" } }
    );
  }

  let generateInvoicePDF: (
    typeof import("@/server/services/invoice-pdf")
  )["generateInvoicePDF"];
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
    console.error("[PDF] Preview generation failed:", err);
    return new Response(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  const arrayBuffer =
    buffer.buffer instanceof ArrayBuffer
      ? buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        )
      : buffer.buffer;

  return new Response(arrayBuffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="template-preview.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
