import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";

// Procedures that read org-stable reference data — safe to cache briefly
// in the browser. Anything not listed defaults to no-store.
const SHORT_CACHE_QUERIES = new Set<string>([
  "currencies.list",
  "taxes.list",
  "expenseCategories.list",
  "expenseSuppliers.list",
  "gatewaySettings.list",
  "taskStatuses.list",
]);

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    responseMeta({ type, paths, errors }) {
      if (type !== "query" || errors.length > 0) {
        return { headers: new Headers({ "cache-control": "no-store" }) };
      }
      const allShortCacheable = paths?.every((p) => SHORT_CACHE_QUERIES.has(p));
      if (allShortCacheable) {
        return {
          headers: new Headers({
            "cache-control": "private, max-age=30, stale-while-revalidate=60",
          }),
        };
      }
      return {
        headers: new Headers({ "cache-control": "private, no-store" }),
      };
    },
  });

export { handler as GET, handler as POST };
