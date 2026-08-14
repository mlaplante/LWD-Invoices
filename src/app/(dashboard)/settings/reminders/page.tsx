import { api, HydrateClient } from "@/trpc/server";
import { RemindersSettingsClient } from "./RemindersSettingsClient";

export const dynamic = "force-dynamic";

// Two children fetch here: ReminderSequenceList (reminderSequences.list) and
// SmartRemindersCard (organization.get). Both are prefetched so neither blocks
// on a post-hydration round trip.
export default async function RemindersSettingsPage() {
  void api.reminderSequences.list.prefetch();
  void api.organization.get.prefetch();

  return (
    <HydrateClient>
      <RemindersSettingsClient />
    </HydrateClient>
  );
}
