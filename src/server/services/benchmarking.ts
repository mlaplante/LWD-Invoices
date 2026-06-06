/**
 * Anonymized cross-tenant benchmarking.
 *
 * Lets an org see how its receivables metrics (DSO, share of AR past due)
 * compare to *similar* businesses — "your DSO beats 78% of similar businesses".
 * Only a multi-tenant platform can offer this, and it must never leak another
 * tenant's identity or raw numbers. Two guards enforce that:
 *
 *   1. k-anonymity — a benchmark is only returned when the peer cohort has at
 *      least MIN_COHORT_SIZE businesses, so a percentile can't be reverse-
 *      engineered into one competitor's figure.
 *   2. Aggregate-only output — callers get their own value plus the cohort
 *      median, size, and a percentile. Never a list, never an id.
 *
 * Cohorts are formed by trailing-12-month revenue band (a coarse size proxy
 * that needs no industry field). The pure math here is unit-tested without a DB;
 * the cross-tenant aggregation lives in benchmarking-data.ts.
 */

export const MIN_COHORT_SIZE = 5;

export type RevenueBand = "under_25k" | "from_25k_100k" | "from_100k_500k" | "over_500k";

export interface RevenueBandDef {
  key: RevenueBand;
  label: string;
  /** Inclusive lower bound, exclusive upper bound (Infinity for the top band). */
  min: number;
  max: number;
}

export const REVENUE_BANDS: RevenueBandDef[] = [
  { key: "under_25k", label: "Under $25k/yr", min: 0, max: 25_000 },
  { key: "from_25k_100k", label: "$25k–$100k/yr", min: 25_000, max: 100_000 },
  { key: "from_100k_500k", label: "$100k–$500k/yr", min: 100_000, max: 500_000 },
  { key: "over_500k", label: "$500k+/yr", min: 500_000, max: Infinity },
];

export function revenueBand(trailingRevenue: number): RevenueBand {
  const band = REVENUE_BANDS.find((b) => trailingRevenue >= b.min && trailingRevenue < b.max);
  // Negative/NaN revenue falls into the smallest band rather than throwing.
  return band?.key ?? "under_25k";
}

export function bandLabel(key: RevenueBand): string {
  return REVENUE_BANDS.find((b) => b.key === key)?.label ?? key;
}

/** Per-org receivables metrics used for benchmarking. */
export interface OrgBenchmarkMetric {
  trailingRevenue: number;
  dso: number;
  /** Share of outstanding AR that is past due, 0–100. */
  percentOverdue: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Fraction of peers (0–1) that `mine` beats. `lowerIsBetter` flips the
 * comparison: for DSO and percent-overdue a lower value is better, so you
 * "beat" a peer whose value is higher than yours. Ties don't count as beaten.
 */
export function shareBeaten(peers: number[], mine: number, lowerIsBetter: boolean): number {
  if (peers.length === 0) return 0;
  const beaten = peers.filter((p) => (lowerIsBetter ? mine < p : mine > p)).length;
  return beaten / peers.length;
}

export interface MetricBenchmark {
  /** This org's value for the metric. */
  value: number;
  /** Median across the whole cohort (peers + self). */
  cohortMedian: number;
  /** Whole-percent share of peers this org beats (0–100). */
  percentile: number;
  /** True when a lower value is the better outcome (drives copy direction). */
  lowerIsBetter: boolean;
}

export type BenchmarkUnavailableReason = "insufficient_cohort" | "no_data";

export interface BenchmarkResult {
  available: boolean;
  reason?: BenchmarkUnavailableReason;
  bandKey?: RevenueBand;
  bandLabel?: string;
  /** Total businesses in the cohort, including this org. */
  cohortSize?: number;
  dso?: MetricBenchmark;
  percentOverdue?: MetricBenchmark;
}

function metricBenchmark(self: number, peers: number[], lowerIsBetter: boolean): MetricBenchmark {
  return {
    value: round1(self),
    cohortMedian: round1(median([...peers, self])),
    percentile: Math.round(shareBeaten(peers, self, lowerIsBetter) * 100),
    lowerIsBetter,
  };
}

/**
 * Assemble a benchmark from the requesting org's metric and its same-band peers
 * (peer arrays exclude self). Enforces k-anonymity on the total cohort size.
 */
export function buildBenchmarkResult(params: {
  self: OrgBenchmarkMetric;
  bandKey: RevenueBand;
  peerDso: number[];
  peerOverdue: number[];
}): BenchmarkResult {
  const cohortSize = params.peerDso.length + 1;
  if (cohortSize < MIN_COHORT_SIZE) {
    return { available: false, reason: "insufficient_cohort", bandKey: params.bandKey, bandLabel: bandLabel(params.bandKey), cohortSize };
  }

  return {
    available: true,
    bandKey: params.bandKey,
    bandLabel: bandLabel(params.bandKey),
    cohortSize,
    dso: metricBenchmark(params.self.dso, params.peerDso, true),
    percentOverdue: metricBenchmark(params.self.percentOverdue, params.peerOverdue, true),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
