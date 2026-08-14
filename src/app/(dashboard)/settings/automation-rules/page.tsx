import { api, HydrateClient } from "@/trpc/server";
import { AutomationRulesSettingsClient } from "./AutomationRulesSettingsClient";

export const dynamic = "force-dynamic";

// The list lives in a child component (AutomationRuleList), but the query it
// fires is the same one either way — prefetching here means the rules are in the
// cache before that child ever mounts.
export default async function AutomationRulesSettingsPage() {
  void api.automationRules.list.prefetch();

  return (
    <HydrateClient>
      <AutomationRulesSettingsClient />
    </HydrateClient>
  );
}
