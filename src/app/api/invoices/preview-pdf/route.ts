import { type NextRequest } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { fullInvoiceInclude } from "@/server/lib/invoice-includes";
import { safeErrorResponse } from "@/lib/api-errors";

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
    return safeErrorResponse("PDF module load failed", 500, {
      route: "invoices/preview-pdf",
      cause: err,
    });
  }

  let buffer: Buffer;
  try {
    buffer = await generateInvoicePDF(invoice);
  } catch (err) {
    return safeErrorResponse("PDF generation failed", 500, {
      route: "invoices/preview-pdf",
      cause: err,
    });
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
