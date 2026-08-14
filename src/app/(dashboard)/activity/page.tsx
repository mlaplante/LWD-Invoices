import { api, HydrateClient } from "@/trpc/server";
import { ActivityPageClient } from "@/components/activity/ActivityPageClient";
import { INITIAL_ACTIVITY_QUERY_ARGS } from "@/lib/activity-query";

export const dynamic = "force-dynamic";

/**
 * Server shell so the first page of audit rows is fetched during the RSC render
 * rather than after hydration. Only the unfiltered first page is worth
 * prefetching — filters and pagination are user-driven, so any other input is
 * unknowable here. The input comes from the same builder the client uses, so the
 * keys cannot drift apart.
 */
export default async function ActivityPage() {
  void api.auditLog.list.prefetch(INITIAL_ACTIVITY_QUERY_ARGS);

  return (
    <HydrateClient>
      <ActivityPageClient />
    </HydrateClient>
  );
}
