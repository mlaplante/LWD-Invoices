import { describe, it, expect } from "vitest";
import { classifyBillable, summarizeUtilization, type UtilizationEntry } from "@/server/services/utilization";

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

  it("groups by month bucket", () => {
    const r = summarizeUtilization(entries, { groupBy: "month", dimension: "project" });
    expect(r.rows.map((x) => x.label).sort()).toEqual(["A", "B"]);
  });

  it("no entries → zero utilization, no NaN", () => {
    const r = summarizeUtilization([], { groupBy: "week", dimension: "user" });
    expect(r.summary.utilizationPct).toBe(0);
    expect(r.rows).toHaveLength(0);
  });
});
