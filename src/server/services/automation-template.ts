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
    orgName: params.orgName,
    amountPaid: params.amountPaid ?? "",
    paymentDate: params.paymentDate ?? "",
  };
}
