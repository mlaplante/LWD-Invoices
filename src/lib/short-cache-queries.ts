// tRPC query paths that read org-stable reference data and are safe to cache
// briefly in the browser. Shared by the route handler (which emits the
// cache-control header) and the client link config (which batches these
// queries separately so a batch is never "mixed" and therefore never
// downgraded to no-store). Keep this list in sync with the 1-minute
// staleTime entries in src/trpc/query-client.ts.
export const SHORT_CACHE_QUERIES: ReadonlySet<string> = new Set<string>([
  "currencies.list",
  "taxes.list",
  "expenseCategories.list",
  "expenseSuppliers.list",
  "gatewaySettings.list",
  "taskStatuses.list",
]);
