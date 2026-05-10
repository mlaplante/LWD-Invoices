import "server-only";
import { unstable_cache } from "next/cache";

/**
 * FX rate lookup with daily caching.
 *
 * Provider: Frankfurter (https://www.frankfurter.app/), a free ECB-data
 * proxy. No API key, no rate limits in practice, daily updates aligned to
 * ECB reference rates. Values are mid-market and accurate enough for
 * invoice display; for accounting-grade conversion, override at invoice
 * level via Invoice.exchangeRate.
 *
 * Cache: keyed by (base, target) with a 24h revalidate window. Mid-market
 * rates change continuously but ECB only publishes once per business day,
 * so anything more aggressive than daily is wasted.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.app";

type RateResponse = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

async function fetchLiveRate(base: string, target: string): Promise<number | null> {
  if (base === target) return 1;
  try {
    const res = await fetch(
      `${FRANKFURTER_BASE}/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(target)}`,
      // Next.js fetch cache. revalidate matches the unstable_cache window
      // below — both layers exist because unstable_cache also dedupes
      // concurrent in-process callers.
      { next: { revalidate: 60 * 60 * 24 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as RateResponse;
    const rate = json.rates?.[target];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Returns the conversion rate `1 base = X target`, or null when the
 * provider is unreachable / returns an unknown currency. Callers should
 * treat null as "leave Invoice.exchangeRate at its default of 1 and warn".
 */
export const getFxRate = (base: string, target: string) =>
  unstable_cache(
    async () => fetchLiveRate(base.toUpperCase(), target.toUpperCase()),
    ["fx-rate", base, target],
    { tags: [`fx-rate:${base}:${target}`], revalidate: 60 * 60 * 24 },
  )();
