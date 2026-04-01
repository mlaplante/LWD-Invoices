import type { FullInvoice } from "../invoice-pdf";
import type { InvoiceTemplateConfig } from "../invoice-template-config";

export type TemplateProps = {
  invoice: FullInvoice;
  config: InvoiceTemplateConfig;
};
