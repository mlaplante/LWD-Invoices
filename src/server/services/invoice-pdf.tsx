import {
  Document,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { Invoice, InvoiceLine, InvoiceLineTax, InvoiceLineStripeTaxBreakdown, Tax, Client, Currency, Organization, Payment, PartialPayment, LateFeeEntry } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma";
import { getInvoiceTemplateConfig } from "./invoice-template-config";
import { TEMPLATE_REGISTRY } from "./pdf-templates";

export type FullInvoice = Invoice & {
  client: Client;
  currency: Currency;
  organization: Organization;
  lines: (InvoiceLine & {
    taxes: (InvoiceLineTax & { tax: Tax })[];
    // Optional so callers that built a FullInvoice before the Stripe Tax era
    // (or via a narrower include) still type-check. The aggregator helper
    // treats undefined as empty.
    stripeTaxBreakdown?: InvoiceLineStripeTaxBreakdown[];
  })[];
  payments: Payment[];
  partialPayments: PartialPayment[];
  lateFeeEntries?: LateFeeEntry[];
};

/** Prisma include clause that loads everything needed for PDF generation */
export const fullInvoiceInclude = {
  client: true,
  currency: true,
  organization: true,
  lines: {
    include: { taxes: { include: { tax: true } }, stripeTaxBreakdown: true },
    orderBy: { sort: "asc" },
  },
  payments: { orderBy: { paidAt: "asc" } },
  partialPayments: { orderBy: { sortOrder: "asc" } },
  lateFeeEntries: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.InvoiceInclude;

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
