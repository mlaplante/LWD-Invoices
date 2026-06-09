export type ProposalStatus = "none" | "draft" | "sent" | "viewed" | "signed";

/**
 * Derive a proposal's lifecycle status from its backing estimate. Mirrors the
 * signals ProposalEngagementPanel already uses: signedAt / ACCEPTED status win,
 * then an "email.opened" event marks "viewed", then a send marks "sent".
 */
export function deriveProposalStatus(input: {
  hasContent: boolean;
  invoiceStatus: string;
  lastSent: Date | null;
  signedAt: Date | null;
  hasOpenEvent: boolean;
}): ProposalStatus {
  if (input.signedAt || input.invoiceStatus === "ACCEPTED") return "signed";
  if (!input.hasContent) return "none";
  if (input.hasOpenEvent) return "viewed";
  if (input.lastSent || input.invoiceStatus === "SENT") return "sent";
  return "draft";
}

export const SUPPORTED_VARIABLES = [
  "client_name",
  "client_url",
  "client_email",
  "date",
  "project_type",
  "platform",
  "platform_description",
  "project_goals",
  "highlight_1",
  "highlight_2",
  "highlight_3",
  "highlight_4",
  "highlight_5",
  "current_state_assessment",
  "design_strategy_description",
  "development_implementation_description",
  "development_tools",
  "analytics_tools",
] as const;

export function substituteVariables(
  content: string | null,
  variables: Record<string, string>
): string | null {
  if (content === null) return null;

  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
