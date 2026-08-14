import { describe, it, expect } from "vitest";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/trpc/client";
import { makeQueryClient } from "@/trpc/query-client";

/**
 * A 60s client staleTime only pays off when the server also caches for ~60s.
 * Applied to an uncached procedure it makes the client recompute an expensive
 * query 5x more often than the 5-minute default — a pessimization disguised as
 * a tuning knob.
 *
 * These tests pin which procedures get the short window. If you wrap a new
 * procedure in `unstable_cache` (or remove a wrapper), the list in
 * query-client.ts and the expectations here should move together.
 */

const MINUTE = 60 * 1000;
const DEFAULT_STALE = 5 * MINUTE;

const client = makeQueryClient();
const staleFor = (proc: Parameters<typeof getQueryKey>[0]) =>
  client.getQueryDefaults(getQueryKey(proc, undefined, "query"))?.staleTime;

describe("query client staleTime targeting", () => {
  it("gives the fully server-cached dashboard router the short window", () => {
    // All 12 dashboard procedures are wrapped in unstable_cache at 60s.
    expect(staleFor(trpc.dashboard.summary)).toBe(MINUTE);
    expect(staleFor(trpc.dashboard.agingReceivables)).toBe(MINUTE);
  });

  it("gives server-cached analytics procedures the short window", () => {
    expect(staleFor(trpc.analytics.runway)).toBe(MINUTE);
    expect(staleFor(trpc.analytics.clientHealth)).toBe(MINUTE);
    expect(staleFor(trpc.analytics.cashFlowForecast)).toBe(MINUTE);
  });

  it("leaves uncached analytics procedures on the 5-minute default", () => {
    // benchmarks has no unstable_cache wrapper — a 60s window would just make
    // it recompute more often against no cache.
    expect(staleFor(trpc.analytics.benchmarks) ?? DEFAULT_STALE).toBe(DEFAULT_STALE);
  });

  it("narrows reports to estimatedTax, the one cached procedure of 26", () => {
    expect(staleFor(trpc.reports.estimatedTax)).toBe(MINUTE);
    expect(staleFor(trpc.reports.profitabilityByProject) ?? DEFAULT_STALE).toBe(
      DEFAULT_STALE
    );
  });

  it("leaves search on the default — it is intentionally not server-cached", () => {
    // Free-text keys would make an unstable_cache entry per query string per
    // org, and stale search results are worse than slightly slower ones.
    expect(staleFor(trpc.search.global) ?? DEFAULT_STALE).toBe(DEFAULT_STALE);
  });

  it("leaves ordinary CRUD routers on the default", () => {
    expect(staleFor(trpc.invoices.list) ?? DEFAULT_STALE).toBe(DEFAULT_STALE);
    expect(staleFor(trpc.clients.list) ?? DEFAULT_STALE).toBe(DEFAULT_STALE);
  });
});
