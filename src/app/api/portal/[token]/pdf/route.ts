import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { fullInvoiceInclude } from "@/server/services/invoice-pdf";
import { getPortalSessionSecret, verifyPortalSession } from "@/lib/portal-session";

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

  // When the client portal is passphrase-protected, require the same signed
  // session cookie the passphrase gate issues — otherwise anyone holding the
  // URL bypasses the passphrase entirely.
  const storedHash = invoice.client?.portalPassphraseHash ?? null;
  if (storedHash) {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(`portal_auth_${token}`);
    if (!authCookie || !verifyPortalSession(authCookie.value, token, getPortalSessionSecret())) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let buffer: Buffer;
  try {
    const { getOrRenderInvoicePDF } = await import("@/server/services/invoice-pdf-cache");
    buffer = await getOrRenderInvoicePDF(invoice);
  } catch (err) {
    console.error("[PDF] generateInvoicePDF failed:", err);
    return new Response("PDF generation failed", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
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
