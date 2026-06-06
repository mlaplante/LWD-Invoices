import { describe, it, expect } from "vitest";
import {
  calculateSubscriptionMetrics,
  normalizeToMonthly,
  type RecurringRevenueStream,
} from "@/server/services/subscription-metrics";

const NOW = new Date("2026-06-06T00:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("normalizeToMonthly", () => {
  it("normalizes each frequency to a monthly figure", () => {
    expect(normalizeToMonthly(1200, "YEARLY", 1)).toBe(100);
    expect(normalizeToMonthly(100, "MONTHLY", 1)).toBe(100);
    expect(normalizeToMonthly(100, "WEEKLY", 1)).toBeCloseTo(433.33, 1);
    expect(normalizeToMonthly(10, "DAILY", 1)).toBeCloseTo(304.17, 1);
  });

  it("divides by the interval", () => {
    expect(normalizeToMonthly(200, "MONTHLY", 2)).toBe(100);
  });
});

describe("calculateSubscriptionMetrics", () => {
  function stream(overrides: Partial<RecurringRevenueStream> = {}): RecurringRevenueStream {
    return {
      clientId: "c1",
      kind: "recurring_invoice",
      amount: 1000,
      frequency: "MONTHLY",
      interval: 1,
      startDate: daysAgo(120),
      endDate: null,
      isActive: true,
      ...overrides,
    };
  }

  it("sums active monthly streams into MRR and ARR", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "a", amount: 1000 }),
        stream({ clientId: "b", amount: 500, frequency: "MONTHLY" }),
        stream({ clientId: "c", amount: 12000, frequency: "YEARLY" }),
      ],
      { now: NOW },
    );
    expect(metrics.mrr).toBe(2500); // 1000 + 500 + 1000
    expect(metrics.arr).toBe(30000);
    expect(metrics.activeCustomers).toBe(3);
    expect(metrics.arpa).toBeCloseTo(833.33, 1);
  });

  it("excludes inactive and ended streams from MRR", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "a", amount: 1000 }),
        stream({ clientId: "b", amount: 999, isActive: false }),
        stream({ clientId: "c", amount: 999, endDate: daysAgo(5) }),
      ],
      { now: NOW },
    );
    expect(metrics.mrr).toBe(1000);
    expect(metrics.activeCustomers).toBe(1);
  });

  it("counts new MRR from streams that started within the period", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "a", amount: 1000, startDate: daysAgo(120) }),
        stream({ clientId: "b", amount: 500, startDate: daysAgo(10) }),
      ],
      { now: NOW, periodDays: 30 },
    );
    expect(metrics.newMrr).toBe(500);
    expect(metrics.netNewMrr).toBe(500);
  });

  it("computes revenue and logo churn from streams that ended within the period", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "keep", amount: 1000, startDate: daysAgo(200) }),
        stream({ clientId: "lost", amount: 1000, startDate: daysAgo(200), endDate: daysAgo(10) }),
      ],
      { now: NOW, periodDays: 30 },
    );
    // At period start both were active (2000); one churned (1000).
    expect(metrics.mrrAtPeriodStart).toBe(2000);
    expect(metrics.churnedMrr).toBe(1000);
    expect(metrics.revenueChurnRatePercent).toBe(50);
    expect(metrics.churnedCustomers).toBe(1);
    expect(metrics.customersAtPeriodStart).toBe(2);
    expect(metrics.logoChurnRatePercent).toBe(50);
  });

  it("does not count a client as churned if they keep another active stream", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "multi", kind: "retainer", amount: 1000, startDate: daysAgo(200), endDate: daysAgo(10) }),
        stream({ clientId: "multi", kind: "recurring_invoice", amount: 500, startDate: daysAgo(200) }),
      ],
      { now: NOW, periodDays: 30 },
    );
    expect(metrics.churnedCustomers).toBe(0);
    expect(metrics.churnedMrr).toBe(1000); // revenue churn still counts the lost stream
  });

  it("breaks MRR down by stream kind", () => {
    const metrics = calculateSubscriptionMetrics(
      [
        stream({ clientId: "a", kind: "recurring_invoice", amount: 1000 }),
        stream({ clientId: "b", kind: "retainer", amount: 2000 }),
        stream({ clientId: "c", kind: "hours_retainer", amount: 500 }),
      ],
      { now: NOW },
    );
    expect(metrics.mrrByKind).toEqual({
      recurring_invoice: 1000,
      retainer: 2000,
      hours_retainer: 500,
    });
  });
});
