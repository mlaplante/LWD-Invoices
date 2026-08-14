import { api, HydrateClient } from "@/trpc/server";
import { AutomationsSettingsClient } from "./AutomationsSettingsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsSettingsPage() {
  void api.emailAutomations.list.prefetch();

  return (
    <HydrateClient>
      <AutomationsSettingsClient />
    </HydrateClient>
  );
}
