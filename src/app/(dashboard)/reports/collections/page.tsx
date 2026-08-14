import { api, HydrateClient } from "@/trpc/server";
import { CollectionsRiskTable } from "@/components/reports/CollectionsRiskTable";

export const dynamic = "force-dynamic";

/**
 * Server shell so the collections-risk scan starts during the RSC render instead
 * of after hydration. This page was previously `"use client"` end to end, which
 * meant the HTML shipped with no data, the browser hydrated, and only then did it
 * issue the request that kicks off `analytics.collectionsRisk` — the most
 * expensive query on any report page (a full org-wide open-invoice scan). The
 * round trip was pure dead time in front of the slowest thing we run.
 */
export default async function CollectionsPage() {
  void api.analytics.collectionsRisk.prefetch();

  return (
    <HydrateClient>
      <CollectionsRiskTable />
    </HydrateClient>
  );
}
