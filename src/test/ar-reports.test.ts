import { describe, it, expect } from "vitest";
import {
  bucketForDaysPastDue,
  daysBetween,
  outstandingAsOf,
  computeDso,
} from "@/server/services/ar-reports";

describe("bucketForDaysPastDue", () => {
  it("buckets by days past the due date", () => {
    expect(bucketForDaysPastDue(-5)).toBe("current");
    expect(bucketForDaysPastDue(0)).toBe("current");
    expect(bucketForDaysPastDue(1)).toBe("d1_30");
    expect(bucketForDaysPastDue(30)).toBe("d1_30");
    expect(bucketForDaysPastDue(31)).toBe("d31_60");
    expect(bucketForDaysPastDue(60)).toBe("d31_60");
    expect(bucketForDaysPastDue(61)).toBe("d61_90");
    expect(bucketForDaysPastDue(90)).toBe("d61_90");
    expect(bucketForDaysPastDue(91)).toBe("d90plus");
    expect(bucketForDaysPastDue(365)).toBe("d90plus");
  });
});

describe("daysBetween", () => {
  it("counts whole UTC days, positive when later is after earlier", () => {
    expect(daysBetween(new Date("2026-06-10T00:00:00Z"), new Date("2026-06-01T00:00:00Z"))).toBe(9);
    expect(daysBetween(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-10T00:00:00Z"))).toBe(-9);
    expect(daysBetween(new Date("2026-06-01T23:00:00Z"), new Date("2026-06-01T01:00:00Z"))).toBe(0);
  });
});

describe("outstandingAsOf", () => {
  const payments = [
    { amount: 40, paidAt: new Date("2026-03-01T00:00:00Z") },
    { amount: 30, paidAt: new Date("2026-05-01T00:00:00Z") },
  ];

  it("subtracts only payments received on or before asOf", () => {
    expect(outstandingAsOf(100, payments, new Date("2026-02-01T00:00:00Z"))).toBe(100);
    expect(outstandingAsOf(100, payments, new Date("2026-04-01T00:00:00Z"))).toBe(60);
    expect(outstandingAsOf(100, payments, new Date("2026-06-01T00:00:00Z"))).toBe(30);
  });

  it("includes a payment exactly at the asOf boundary", () => {
    expect(outstandingAsOf(100, payments, new Date("2026-03-01T00:00:00Z"))).toBe(60);
  });

  it("floors at zero on overpayment", () => {
    expect(outstandingAsOf(50, payments, new Date("2026-06-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeDso", () => {
  it("expresses AR as days of trailing sales", () => {
    // 365 of sales over 365 days = $1/day; $90 AR = 90 days.
    expect(computeDso(90, 365)).toBeCloseTo(90, 5);
  });

  it("returns 0 when there are no trailing sales", () => {
    expect(computeDso(500, 0)).toBe(0);
  });

  it("honours a custom window", () => {
    // $3000 sales over a 30-day window = $100/day; $500 AR = 5 days.
    expect(computeDso(500, 3000, 30)).toBeCloseTo(5, 5);
  });
});
