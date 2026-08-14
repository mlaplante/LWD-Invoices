import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import superjson from "@/lib/superjson";

const ONE_MINUTE = 60 * 1000;

/**
 * A 60s client staleTime is only a win where the *server* also caches for ~60s:
 * the refetch then lands on a warm `unstable_cache` entry and costs almost
 * nothing. Applied to an uncached procedure it does the opposite — it makes the
 * client recompute an expensive query five times more often than the 5-minute
 * default would.
 *
 * This list used to be router-wide (`dashboard`, `reports`, `search`,
 * `analytics`) on the stated premise that all four "cache at ~60s on the
 * backend". That was only true of `dashboard`. Verified counts:
 *
 *   dashboard   12 procedures, all wrapped in unstable_cache  -> router-wide 60s
 *   analytics   15 procedures,  5 wrapped                     -> per-procedure
 *   reports     26 procedures,  1 wrapped (estimatedTax)      -> per-procedure
 *   search       1 procedure,   0 wrapped                     -> see below
 *
 * So the old config was pushing 25 of 26 report procedures and 10 of 15
 * analytics procedures into 5x more frequent recomputation than the default,
 * for no cache to land on. Everything not listed here now falls back to the
 * 5-minute default.
 *
 * Keep this in sync when you add or remove an `unstable_cache` wrapper: a
 * procedure listed here without a server cache is a pessimization, and one with
 * a server cache but not listed just leaves the cache under-used.
 */
const SHORT_STALE_ROUTERS = ["dashboard"] as const;

const SHORT_STALE_PROCEDURES = [
  ["analytics", "cashFlowForecast"],
  ["analytics", "clientHealth"],
  ["analytics", "profitabilityInsights"],
  ["analytics", "runway"],
  ["analytics", "weeklyBriefing"],
  ["reports", "estimatedTax"],
] as const;

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

  // tRPC query keys look like [["router","procedure"], { input, type }], and
  // react-query matches defaults by key prefix — so [["router"]] covers a whole
  // router and [["router","procedure"]] narrows to one procedure.
  for (const routerName of SHORT_STALE_ROUTERS) {
    client.setQueryDefaults([[routerName]], { staleTime: ONE_MINUTE });
  }
  for (const path of SHORT_STALE_PROCEDURES) {
    client.setQueryDefaults([[...path]], { staleTime: ONE_MINUTE });
  }

  // `search` is deliberately not in either list above, and deliberately not
  // server-cached: results are keyed by a free-text query, so an unstable_cache
  // entry per search string per org would be unbounded, and stale search results
  // are worse than slightly slower ones. The CommandPalette already debounces
  // 300ms and normalizes the query string, which is what actually collapses
  // repeated keystrokes — the 5-minute default is fine for the rest.

  return client;
}
