import { describe, it, expect } from "vitest";
import { classifyBillable, summarizeUtilization, monthBucket, weekBucket, type UtilizationEntry } from "@/server/services/utilization";

describe("classifyBillable", () => {
  it("treats hourly-project time as billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: false, rate: 100 } })).toBe(true);
  });
  it("treats retainer time as billable", () => {
    expect(classifyBillable({ retainerId: "r1", project: null })).toBe(true);
  });
  it("treats flat-rate project time as non-billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: true, rate: 100 } })).toBe(false);
  });
  it("treats rate-0 / no-project time as non-billable", () => {
    expect(classifyBillable({ retainerId: null, project: { isFlatRate: false, rate: 0 } })).toBe(false);
    expect(classifyBillable({ retainerId: null, project: null })).toBe(false);
  });
});

describe("monthBucket", () => {
  it("returns YYYY-MM key and 'Mon YYYY' label (UTC)", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    const b = monthBucket(d);
    expect(b.key).toBe("2026-06");
    expect(b.label).toBe("Jun 2026");
  });

  it("pads single-digit months", () => {
    const d = new Date("2026-03-01T00:00:00Z");
    const b = monthBucket(d);
    expect(b.key).toBe("2026-03");
    expect(b.label).toBe("Mar 2026");
  });
});

describe("weekBucket", () => {
  it("returns Monday of the ISO week as YYYY-MM-DD key", () => {
    // 2026-06-03 is a Wednesday; Monday of that week is 2026-06-01
    const d = new Date("2026-06-03T12:00:00Z");
    const b = weekBucket(d);
    expect(b.key).toBe("2026-06-01");
    expect(b.label).toBe("Week of Jun 1, 2026");
  });

  it("a Monday maps to itself", () => {
    // 2026-06-01 is a Monday
    const d = new Date("2026-06-01T00:00:00Z");
    const b = weekBucket(d);
    expect(b.key).toBe("2026-06-01");
  });

  it("a Sunday maps to the previous Monday", () => {
    // 2026-06-07 is a Sunday; Monday is 2026-06-01
    const d = new Date("2026-06-07T00:00:00Z");
    const b = weekBucket(d);
    expect(b.key).toBe("2026-06-01");
  });
});

describe("summarizeUtilization", () => {
  const entries: UtilizationEntry[] = [
    { date: new Date("2026-06-01T12:00:00Z"), minutes: 120, retainerId: null, projectId: "p1", projectName: "A", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
    { date: new Date("2026-06-02T12:00:00Z"), minutes: 60,  retainerId: null, projectId: "p2", projectName: "B", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: true, rate: 100 } },
  ];

  it("computes overall utilization (billable/total)", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "client" });
    expect(r.summary.billableHours).toBeCloseTo(2, 5);
    expect(r.summary.nonBillableHours).toBeCloseTo(1, 5);
    expect(r.summary.totalHours).toBeCloseTo(3, 5);
    expect(r.summary.utilizationPct).toBeCloseTo(2 / 3, 5);
  });

  it("groups by client", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "client" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].label).toBe("Acme");
  });

  it("groups by month bucket — existing two entries in same month produce two project rows", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "project" });
    expect(r.rows.map((x) => x.label).sort()).toEqual(["A", "B"]);
  });

  it("sets period and periodLabel on rows", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "client" });
    expect(r.rows[0].period).toBe("2026-06");
    expect(r.rows[0].periodLabel).toBeDefined();
    expect(r.rows[0].periodLabel).toBe("Jun 2026");
  });

  it("no entries → zero utilization, no NaN", () => {
    const r = summarizeUtilization([], { groupBy: "week", dimension: "user" });
    expect(r.summary.utilizationPct).toBe(0);
    expect(r.rows).toHaveLength(0);
  });

  it("same dimension value in two different months → two rows with distinct periods (groupBy:month)", () => {
    const multiMonth: UtilizationEntry[] = [
      { date: new Date("2026-06-01T12:00:00Z"), minutes: 120, retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
      { date: new Date("2026-07-01T12:00:00Z"), minutes: 60,  retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
    ];
    const r = summarizeUtilization(multiMonth, { groupBy: "month", dimension: "project" });
    expect(r.rows).toHaveLength(2);
    const periods = r.rows.map((row) => row.period);
    expect(periods).toContain("2026-06");
    expect(periods).toContain("2026-07");
    // sorted period ascending: June first
    expect(r.rows[0].period).toBe("2026-06");
    expect(r.rows[1].period).toBe("2026-07");
  });

  it("same dimension value in two different ISO weeks → two rows with distinct periods (groupBy:week)", () => {
    const multiWeek: UtilizationEntry[] = [
      // 2026-06-01 is a Monday (week key: 2026-06-01)
      { date: new Date("2026-06-01T12:00:00Z"), minutes: 120, retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
      // 2026-06-08 is the next Monday (week key: 2026-06-08)
      { date: new Date("2026-06-08T12:00:00Z"), minutes: 60,  retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
    ];
    const r = summarizeUtilization(multiWeek, { groupBy: "week", dimension: "project" });
    expect(r.rows).toHaveLength(2);
    const periods = r.rows.map((row) => row.period);
    expect(periods).toContain("2026-06-01");
    expect(periods).toContain("2026-06-08");
    // sorted period ascending
    expect(r.rows[0].period).toBe("2026-06-01");
    expect(r.rows[1].period).toBe("2026-06-08");
  });

  it("row.key is the compound bucket::dimKey (unique per period × dimension)", () => {
    const multiMonth: UtilizationEntry[] = [
      { date: new Date("2026-06-01T12:00:00Z"), minutes: 60, retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
      { date: new Date("2026-07-01T12:00:00Z"), minutes: 60, retainerId: null, projectId: "p1", projectName: "Alpha", clientId: "c1", clientName: "Acme", userId: "u1", userName: "Sam", project: { isFlatRate: false, rate: 100 } },
    ];
    const r = summarizeUtilization(multiMonth, { groupBy: "month", dimension: "project" });
    const keys = r.rows.map((row) => row.key);
    expect(keys[0]).toBe("2026-06::p1");
    expect(keys[1]).toBe("2026-07::p1");
  });
});
