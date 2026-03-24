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
