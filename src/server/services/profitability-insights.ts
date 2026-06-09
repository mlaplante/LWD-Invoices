/**
 * Profitability insights (cash-margin basis).
 *
 * Reads per-client cash-margin rows — revenue minus external costs (expenses +
 * attributable contractor pay), with the owner's own time counted as free — and
 * surfaces recommendations: clients losing money, and clients whose margin sits
 * well below the portfolio median.
 *
 * This is a separate, clearly-labeled basis from the existing
 * /reports/profitability report (which counts tracked time at the billing rate
 * as a cost); that report is intentionally left untouched.
 *
 * NOTE: a break-even-by-hours recommendation ("profitable only if remaining
 * hours stay under N") is deliberately omitted here — under a cash-margin basis
 * the owner's hours carry no cost, so an hours break-even is undefined without a
 * labor-cost rate (out of scope per the cash-margin decision).
 *
 * Pure function (`buildProfitabilityInsights`); the router builds the rows from
 * Prisma aggregates.
 */

export interface ProfitabilityRow {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

export type ProfitabilityRecommendationType = "negative_margin" | "below_median";

export interface ProfitabilityRecommendation {
  id: string;
  name: string;
  type: ProfitabilityRecommendationType;
  marginPercent: number;
  message: string;
}

export interface ProfitabilityInsights {
  medianMarginPercent: number;
  recommendations: ProfitabilityRecommendation[];
}

export interface BuildProfitabilityInsightsOptions {
  /** Flag a client when its margin is at least this percent below the median (relative). */
  belowMedianRelativePercent?: number;
  /** Ignore tiny clients with revenue below this floor. */
  minRevenue?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildProfitabilityInsights(
  rows: ProfitabilityRow[],
  options: BuildProfitabilityInsightsOptions = {},
): ProfitabilityInsights {
  const belowMedianRelativePercent = options.belowMedianRelativePercent ?? 25;
  const minRevenue = options.minRevenue ?? 0;

  const considered = rows.filter((r) => r.revenue >= minRevenue);
  const medianMarginPercent = round(median(considered.map((r) => r.marginPercent)));

  const recommendations: ProfitabilityRecommendation[] = [];

  for (const r of considered) {
    if (r.marginPercent < 0) {
      recommendations.push({
        id: r.id,
        name: r.name,
        type: "negative_margin",
        marginPercent: round(r.marginPercent),
        message: `${r.name} is losing money — margin is ${round(r.marginPercent)}% (revenue ${r.revenue.toLocaleString("en-US")}, cost ${r.cost.toLocaleString("en-US")}).`,
      });
      continue;
    }
    // Relative gap below the median, e.g. median 50%, client 29% → 42% below.
    if (medianMarginPercent > 0) {
      const relativeGap = ((medianMarginPercent - r.marginPercent) / medianMarginPercent) * 100;
      if (relativeGap >= belowMedianRelativePercent) {
        recommendations.push({
          id: r.id,
          name: r.name,
          type: "below_median",
          marginPercent: round(r.marginPercent),
          message: `${r.name}'s margin (${round(r.marginPercent)}%) is ${Math.round(relativeGap)}% below your median of ${medianMarginPercent}%.`,
        });
      }
    }
  }

  // Worst margins first.
  recommendations.sort((a, b) => a.marginPercent - b.marginPercent);

  return { medianMarginPercent, recommendations };
}
