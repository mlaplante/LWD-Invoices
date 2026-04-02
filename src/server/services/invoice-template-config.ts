export type InvoiceTemplateConfig = {
  template: "modern" | "classic" | "minimal" | "compact";
  fontFamily: string;       // React PDF font family name
  accentColor: string;      // hex
  showLogo: boolean;
  footerText: string | null;
};

const FONT_MAP: Record<string, string> = {
  helvetica: "Helvetica",
  georgia: "Times-Roman",      // React PDF built-in serif
  courier: "Courier",
};

export function getInvoiceTemplateConfig(org: {
  brandColor: string | null;
  invoiceTemplate?: string | null;
  invoiceFontFamily?: string | null;
  invoiceAccentColor?: string | null;
  invoiceShowLogo?: boolean;
  invoiceFooterText?: string | null;
}): InvoiceTemplateConfig {
  const validTemplates = ["modern", "classic", "minimal", "compact"] as const;
  const rawTemplate = org.invoiceTemplate ?? "modern";
  const template = validTemplates.includes(rawTemplate as typeof validTemplates[number])
    ? (rawTemplate as InvoiceTemplateConfig["template"])
    : "modern";

  return {
    template,
    fontFamily: FONT_MAP[org.invoiceFontFamily ?? "helvetica"] ?? "Helvetica",
    accentColor: org.invoiceAccentColor ?? org.brandColor ?? "#2563eb",
    showLogo: org.invoiceShowLogo ?? true,
    footerText: org.invoiceFooterText ?? null,
  };
}
