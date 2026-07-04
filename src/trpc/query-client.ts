import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import superjson from "@/lib/superjson";

// Routers whose backend caches at ~60s (see src/server/routers/dashboard.ts,
// reports.ts, and analytics.ts). Aligning the client staleTime keeps the
// dashboard fresher than the 5-minute global default without overshooting the
// backend cache window.
const SHORT_STALE_ROUTERS = new Set(["dashboard", "reports", "search", "analytics"]);

export function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });

  // Per-router overrides. tRPC query keys look like [["router","procedure"], ...],
  // so we match on the first path segment.
  for (const routerName of SHORT_STALE_ROUTERS) {
    client.setQueryDefaults([[routerName]], {
      staleTime: 60 * 1000,
    });
  }

  return client;
}
