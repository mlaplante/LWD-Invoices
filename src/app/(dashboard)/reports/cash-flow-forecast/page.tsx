import { api, HydrateClient } from "@/trpc/server";
import { CashFlowForecastClient } from "./CashFlowForecastClient";

export const dynamic = "force-dynamic";

// The client calls `useQuery(scenario ? { scenarios: [scenario] } : undefined)`,
// and `scenario` starts null — so the first render asks for the undefined-input
// key. Prefetching `undefined` matches it. Once the user picks a what-if
// scenario the key legitimately changes and that variant is fetched on demand.
export default async function CashFlowForecastPage() {
  void api.analytics.cashFlowForecast.prefetch(undefined);

  return (
    <HydrateClient>
      <CashFlowForecastClient />
    </HydrateClient>
  );
}
