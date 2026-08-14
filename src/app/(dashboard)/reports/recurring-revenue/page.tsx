import { api, HydrateClient } from "@/trpc/server";
import { RecurringRevenueClient } from "./RecurringRevenueClient";

export const dynamic = "force-dynamic";

export default async function RecurringRevenuePage() {
  void api.analytics.subscriptionMetrics.prefetch();

  return (
    <HydrateClient>
      <RecurringRevenueClient />
    </HydrateClient>
  );
}
