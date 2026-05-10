import {
  Document,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { Prisma } from "@/generated/prisma";
import { getInvoiceTemplateConfig } from "./invoice-template-config";
import { TEMPLATE_REGISTRY } from "./pdf-templates";
import { fullInvoiceInclude } from "@/server/lib/invoice-includes";

// Re-exported so existing callers that imported fullInvoiceInclude from this
// file keep working. The single source of truth lives in invoice-includes.ts.
export { fullInvoiceInclude };

export type FullInvoice = Prisma.InvoiceGetPayload<{
  include: typeof fullInvoiceInclude;
}>;

function InvoiceDocument({ invoice }: { invoice: FullInvoice }) {
  const config = getInvoiceTemplateConfig(invoice.organization);
  const TemplateComponent = TEMPLATE_REGISTRY[config.template] ?? TEMPLATE_REGISTRY.modern;

  return (
    <Document>
      <TemplateComponent invoice={invoice} config={config} />
    </Document>
  );
}

export async function generateInvoicePDF(invoice: FullInvoice): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoiceDocument invoice={invoice} />);
  return Buffer.from(buffer);
}
