import { describe, it, expect } from "vitest";
import {
  buildProfitabilityInsights,
  type ProfitabilityRow,
} from "@/server/services/profitability-insights";

function row(overrides: Partial<ProfitabilityRow> = {}): ProfitabilityRow {
  const revenue = overrides.revenue ?? 1000;
  const cost = overrides.cost ?? 500;
  return {
    id: Math.random().toString(36).slice(2),
    name: "Client",
    revenue,
    cost,
    margin: revenue - cost,
    marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    ...overrides,
  };
}

describe("buildProfitabilityInsights — median", () => {
  it("computes the median margin percent across rows", () => {
    const insights = buildProfitabilityInsights([
      row({ revenue: 1000, cost: 500 }), // 50%
      row({ revenue: 1000, cost: 600 }), // 40%
      row({ revenue: 1000, cost: 400 }), // 60%
    ]);
    expect(insights.medianMarginPercent).toBe(50);
  });

  it("returns no recommendations for an empty set", () => {
    const insights = buildProfitabilityInsights([]);
    expect(insights.recommendations).toHaveLength(0);
    expect(insights.medianMarginPercent).toBe(0);
  });
});

describe("buildProfitabilityInsights — below median", () => {
  it("flags a client whose margin is well below the median", () => {
    const insights = buildProfitabilityInsights([
      row({ id: "a", name: "Acme", revenue: 1000, cost: 710 }), // 29%
      row({ id: "b", revenue: 1000, cost: 500 }), // 50%
      row({ id: "c", revenue: 1000, cost: 500 }), // 50% (median 50)
    ]);
    const rec = insights.recommendations.find((r) => r.id === "a");
    expect(rec).toBeDefined();
    expect(rec!.type).toBe("below_median");
    // 29% is ~42% below the median of 50%.
    expect(rec!.message).toContain("below your median");
  });

  it("does not flag a client at or above the median", () => {
    const insights = buildProfitabilityInsights([
      row({ id: "a", revenue: 1000, cost: 500 }), // 50%
      row({ id: "b", revenue: 1000, cost: 450 }), // 55%
      row({ id: "c", revenue: 1000, cost: 500 }), // 50%
    ]);
    expect(insights.recommendations.find((r) => r.id === "b")).toBeUndefined();
  });

  it("respects a custom below-median threshold", () => {
    const rows = [
      row({ id: "a", revenue: 1000, cost: 600 }), // 40%
      row({ id: "b", revenue: 1000, cost: 500 }), // 50%
      row({ id: "c", revenue: 1000, cost: 500 }), // 50% (median 50)
    ];
    // 40% is 20% below median; a 25% threshold should not flag it.
    const lenient = buildProfitabilityInsights(rows, { belowMedianRelativePercent: 25 });
    expect(lenient.recommendations.find((r) => r.id === "a")).toBeUndefined();
    // A 10% threshold should.
    const strict = buildProfitabilityInsights(rows, { belowMedianRelativePercent: 10 });
    expect(strict.recommendations.find((r) => r.id === "a")).toBeDefined();
  });
});

describe("buildProfitabilityInsights — negative margin", () => {
  it("flags a client losing money regardless of the median", () => {
    const insights = buildProfitabilityInsights([
      row({ id: "loss", name: "Underwater", revenue: 1000, cost: 1200 }), // -20%
      row({ id: "b", revenue: 1000, cost: 500 }),
      row({ id: "c", revenue: 1000, cost: 500 }),
    ]);
    const rec = insights.recommendations.find((r) => r.id === "loss");
    expect(rec).toBeDefined();
    expect(rec!.type).toBe("negative_margin");
  });
});
