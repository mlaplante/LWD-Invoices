import { describe, it, expect, vi } from "vitest";
import {
  revenueBand,
  bandLabel,
  median,
  shareBeaten,
  buildBenchmarkResult,
  MIN_COHORT_SIZE,
  type OrgBenchmarkMetric,
} from "@/server/services/benchmarking";
import {
  computeOrgMetric,
  aggregateOrgMetrics,
  benchmarkFromMetrics,
  getBenchmarksForOrg,
  type BenchmarkInvoice,
} from "@/server/services/benchmarking-data";

const now = new Date("2026-06-15T00:00:00Z");

describe("revenueBand", () => {
  it("buckets by trailing revenue with inclusive lower bounds", () => {
    expect(revenueBand(0)).toBe("under_25k");
    expect(revenueBand(24_999)).toBe("under_25k");
    expect(revenueBand(25_000)).toBe("from_25k_100k");
    expect(revenueBand(100_000)).toBe("from_100k_500k");
    expect(revenueBand(500_000)).toBe("over_500k");
    expect(revenueBand(9_999_999)).toBe("over_500k");
  });
  it("treats negative/NaN revenue as the smallest band", () => {
    expect(revenueBand(-1)).toBe("under_25k");
    expect(revenueBand(Number.NaN)).toBe("under_25k");
  });
  it("has a label for every band", () => {
    expect(bandLabel("from_25k_100k")).toContain("$25k");
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("shareBeaten", () => {
  it("counts peers strictly worse (lower-is-better)", () => {
    // mine=30; peers 40,50,20,30 → beats 40 and 50 → 2/4
    expect(shareBeaten([40, 50, 20, 30], 30, true)).toBe(0.5);
  });
  it("flips direction when higher is better", () => {
    expect(shareBeaten([10, 20, 5], 15, false)).toBeCloseTo(2 / 3, 5);
  });
  it("returns 0 with no peers", () => {
    expect(shareBeaten([], 10, true)).toBe(0);
  });
});

describe("buildBenchmarkResult — k-anonymity", () => {
  const self: OrgBenchmarkMetric = { trailingRevenue: 50_000, dso: 20, percentOverdue: 10 };

  it("withholds the benchmark when the cohort is too small", () => {
    const result = buildBenchmarkResult({
      self,
      bandKey: "from_25k_100k",
      peerDso: [30, 40, 50], // cohort size 4 < MIN_COHORT_SIZE (5)
      peerOverdue: [20, 30, 40],
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("insufficient_cohort");
    expect(result.cohortSize).toBe(4);
    expect(result.dso).toBeUndefined();
  });

  it("returns a percentile when the cohort is large enough", () => {
    const result = buildBenchmarkResult({
      self,
      bandKey: "from_25k_100k",
      peerDso: [30, 40, 50, 60], // 4 peers + self = 5 = MIN
      peerOverdue: [20, 30, 40, 50],
    });
    expect(MIN_COHORT_SIZE).toBe(5);
    expect(result.available).toBe(true);
    expect(result.cohortSize).toBe(5);
    // self dso=20 beats all 4 peers → 100th percentile
    expect(result.dso!.percentile).toBe(100);
    expect(result.dso!.value).toBe(20);
    expect(result.dso!.cohortMedian).toBe(40); // median of [30,40,50,60,20]
    expect(result.dso!.lowerIsBetter).toBe(true);
  });
});

describe("computeOrgMetric", () => {
  it("computes AR, trailing revenue, DSO and overdue share", () => {
    const invoices: BenchmarkInvoice[] = [
      // issued 100 days ago, due 40 days ago, unpaid → overdue AR 1000
      { organizationId: "o", date: new Date("2026-03-07T00:00:00Z"), dueDate: new Date("2026-05-06T00:00:00Z"), total: 1000, payments: [] },
      // issued 30 days ago, due in future, paid in full → no AR, counts as sales
      { organizationId: "o", date: new Date("2026-05-16T00:00:00Z"), dueDate: new Date("2026-07-01T00:00:00Z"), total: 2000, payments: [{ amount: 2000, paidAt: new Date("2026-05-20T00:00:00Z") }] },
    ];
    const m = computeOrgMetric(invoices, now);
    expect(m.trailingRevenue).toBe(3000);
    expect(m.percentOverdue).toBe(100); // the only outstanding AR is overdue
    // DSO = AR(1000) / (3000/365) = 121.67
    expect(Math.round(m.dso)).toBe(122);
  });

  it("excludes invoices issued after `now` and yields zero DSO with no sales", () => {
    const invoices: BenchmarkInvoice[] = [
      { organizationId: "o", date: new Date("2026-09-01T00:00:00Z"), dueDate: null, total: 5000, payments: [] },
    ];
    const m = computeOrgMetric(invoices, now);
    expect(m.trailingRevenue).toBe(0);
    expect(m.dso).toBe(0);
  });
});

describe("aggregateOrgMetrics + benchmarkFromMetrics", () => {
  it("groups by org and benchmarks within the same revenue band", () => {
    const metrics = new Map<string, OrgBenchmarkMetric>([
      ["me", { trailingRevenue: 50_000, dso: 25, percentOverdue: 10 }],
      ["p1", { trailingRevenue: 60_000, dso: 40, percentOverdue: 20 }],
      ["p2", { trailingRevenue: 30_000, dso: 50, percentOverdue: 30 }],
      ["p3", { trailingRevenue: 90_000, dso: 35, percentOverdue: 15 }],
      ["p4", { trailingRevenue: 70_000, dso: 10, percentOverdue: 5 }],
      // different band — must be excluded from the cohort
      ["big", { trailingRevenue: 800_000, dso: 5, percentOverdue: 1 }],
      // dormant — excluded
      ["dorm", { trailingRevenue: 0, dso: 0, percentOverdue: 0 }],
    ]);

    const result = benchmarkFromMetrics(metrics, "me");
    expect(result.available).toBe(true);
    expect(result.bandKey).toBe("from_25k_100k");
    expect(result.cohortSize).toBe(5); // me + p1..p4 (big & dorm excluded)
    // me dso=25 beats p1(40),p2(50),p3(35) but not p4(10) → 3/4 = 75
    expect(result.dso!.percentile).toBe(75);
  });

  it("reports no_data for an org with no trailing revenue", () => {
    const metrics = new Map<string, OrgBenchmarkMetric>([
      ["me", { trailingRevenue: 0, dso: 0, percentOverdue: 0 }],
    ]);
    expect(benchmarkFromMetrics(metrics, "me").reason).toBe("no_data");
  });

  it("groups flat rows by organizationId", () => {
    const rows: BenchmarkInvoice[] = [
      { organizationId: "a", date: new Date("2026-05-01T00:00:00Z"), dueDate: null, total: 100, payments: [] },
      { organizationId: "b", date: new Date("2026-05-01T00:00:00Z"), dueDate: null, total: 200, payments: [] },
    ];
    const m = aggregateOrgMetrics(rows, now);
    expect(m.size).toBe(2);
    expect(m.get("a")!.trailingRevenue).toBe(100);
  });
});

describe("getBenchmarksForOrg", () => {
  it("fetches cross-tenant invoices and returns an anonymized result", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { organizationId: "me", date: new Date("2026-05-01T00:00:00Z"), dueDate: new Date("2026-05-20T00:00:00Z"), total: 40_000, payments: [] },
      { organizationId: "p1", date: new Date("2026-05-01T00:00:00Z"), dueDate: new Date("2026-05-20T00:00:00Z"), total: 40_000, payments: [] },
      { organizationId: "p2", date: new Date("2026-05-01T00:00:00Z"), dueDate: new Date("2026-05-20T00:00:00Z"), total: 40_000, payments: [] },
      { organizationId: "p3", date: new Date("2026-05-01T00:00:00Z"), dueDate: new Date("2026-05-20T00:00:00Z"), total: 40_000, payments: [] },
      { organizationId: "p4", date: new Date("2026-05-01T00:00:00Z"), dueDate: new Date("2026-05-20T00:00:00Z"), total: 40_000, payments: [] },
    ]);
    const db = { invoice: { findMany } } as never;

    const result = await getBenchmarksForOrg(db, "me", now);
    expect(findMany).toHaveBeenCalledTimes(1);
    // The query must not be org-scoped (cross-tenant by design).
    expect(findMany.mock.calls[0][0].where.organizationId).toBeUndefined();
    expect(result.available).toBe(true);
    expect(result.cohortSize).toBe(5);
  });
});
