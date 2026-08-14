import { api, HydrateClient } from "@/trpc/server";
import { ScheduledReportsSettingsClient } from "./ScheduledReportsSettingsClient";

export const dynamic = "force-dynamic";

export default async function ScheduledReportsSettingsPage() {
  void api.scheduledReports.list.prefetch();

  return (
    <HydrateClient>
      <ScheduledReportsSettingsClient />
    </HydrateClient>
  );
}
