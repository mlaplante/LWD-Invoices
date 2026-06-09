import { describe, it, expect } from "vitest";
import { computeConcentration } from "@/server/services/client-concentration";

describe("computeConcentration", () => {
  it("returns an empty result when there is no revenue", () => {
    const r = computeConcentration([]);
    expect(r.rows).toEqual([]);
    expect(r.summary.totalRevenue).toBe(0);
    expect(r.summary.activeClients).toBe(0);
    expect(r.summary.topClientPct).toBe(0);
    expect(r.summary.hhi).toBe(0);
    expect(r.summary.riskLevel).toBe("ok");
    expect(r.summary.topClientName).toBeNull();
  });

  it("computes shares, cumulative shares, and sorts descending", () => {
    const r = computeConcentration([
      { clientId: "a", name: "Acme", revenue: 200 },
      { clientId: "b", name: "Beta", revenue: 600 },
      { clientId: "c", name: "Cyan", revenue: 200 },
    ]);
    expect(r.summary.totalRevenue).toBe(1000);
    expect(r.summary.activeClients).toBe(3);
    expect(r.rows[0]).toMatchObject({ clientId: "b", share: 60, cumulativeShare: 60 });
    expect(r.rows[1].cumulativeShare).toBeCloseTo(80, 5);
    expect(r.rows[2].cumulativeShare).toBeCloseTo(100, 5);
    expect(r.summary.topClientPct).toBe(60);
    expect(r.summary.topClientName).toBe("Beta");
  });

  it("computes top-3 / top-5 buckets without exceeding available clients", () => {
    const r = computeConcentration([
      { clientId: "a", name: "A", revenue: 50 },
      { clientId: "b", name: "B", revenue: 30 },
      { clientId: "c", name: "C", revenue: 20 },
    ]);
    expect(r.summary.top3Pct).toBeCloseTo(100, 5);
    expect(r.summary.top5Pct).toBeCloseTo(100, 5);
  });

  it("computes HHI as the sum of squared fractional shares times 10000", () => {
    const mono = computeConcentration([{ clientId: "a", name: "A", revenue: 500 }]);
    expect(mono.summary.hhi).toBeCloseTo(10000, 5);
    expect(mono.summary.riskLevel).toBe("critical");
    const even = computeConcentration([
      { clientId: "a", name: "A", revenue: 100 },
      { clientId: "b", name: "B", revenue: 100 },
    ]);
    expect(even.summary.hhi).toBeCloseTo(5000, 5);
  });

  it("bands risk on the top client's share at the boundaries", () => {
    // Build inputs so "Top" is always the largest client (share = topPct%).
    // A flat 2-client [topPct, 100-topPct] fails when topPct < 50 because
    // the "Rest" client then has more revenue and sorts first. Instead we
    // split the remainder into chunks each strictly smaller than topPct so
    // "Top" always wins the sort.
    const at = (topPct: number) => {
      const rest = 100 - topPct;
      const clients: { clientId: string; name: string; revenue: number }[] = [
        { clientId: "top", name: "Top", revenue: topPct },
      ];
      let remaining = rest;
      let i = 0;
      while (remaining > 0) {
        const piece = Math.min(topPct - 0.001, remaining);
        clients.push({ clientId: `r${i}`, name: `R${i}`, revenue: piece });
        remaining -= piece;
        i++;
      }
      return computeConcentration(clients).summary.riskLevel;
    };
    expect(at(50)).toBe("critical");
    expect(at(49)).toBe("high");
    expect(at(30)).toBe("high");
    expect(at(29)).toBe("watch");
    expect(at(15)).toBe("watch");
    expect(at(14)).toBe("ok");
  });
});
