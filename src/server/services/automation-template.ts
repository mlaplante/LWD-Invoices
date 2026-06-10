/**
 * Template variable interpolation engine for email automations.
 * Replaces {{ variableName }} placeholders with actual values.
 * Unknown variables are passed through unchanged.
 */

export const AVAILABLE_VARIABLES = [
  "clientName",
  "invoiceNumber",
  "amountDue",
  "dueDate",
  "paymentLink",
  "paymentUrl",
  "orgName",
  "amountPaid",
  "paymentDate",
] as const;

export type TemplateVariables = Partial<Record<(typeof AVAILABLE_VARIABLES)[number], string>>;

/**
 * Interpolates template variables in the form {{ varName }} or {{varName}}.
 * Unknown variables are left as-is (passthrough).
 */
export function interpolateTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (key in vars) {
      return vars[key as keyof TemplateVariables] ?? match;
    }
    return match;
  });
}

/** Minimal HTML entity escaping for text destined for an HTML email body. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a user-authored plain-text template ({{ var }} placeholders, no HTML)
 * as a safe HTML email body. The template text is fully escaped — admins type
 * plain text in the builder UIs, so any markup in the stored body is treated
 * as content, never as HTML — then URLs (e.g. the interpolated payment link)
 * are made clickable and newlines become <br>.
 */
export function renderTemplateHtml(template: string, vars: TemplateVariables): string {
  const escaped = escapeHtml(interpolateTemplate(template, vars));
  const linked = escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  const withBreaks = linked.replace(/\r?\n/g, "<br>");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.5">${withBreaks}</div>`;
}

export interface BuildTemplateVariablesParams {
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  portalToken: string;
  orgName: string;
  amountPaid?: string;
  paymentDate?: string;
}

/**
 * Builds a TemplateVariables object from invoice/payment data.
 */
export function buildTemplateVariables(params: BuildTemplateVariablesParams): TemplateVariables {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";
  return {
    clientName: params.clientName,
    invoiceNumber: params.invoiceNumber,
    amountDue: params.amountDue,
    dueDate: params.dueDate,
    paymentLink: `${appUrl}/portal/${params.portalToken}`,
    paymentUrl: `${appUrl}/portal/${params.portalToken}`,
    orgName: params.orgName,
    amountPaid: params.amountPaid ?? "",
    paymentDate: params.paymentDate ?? "",
  };
}
