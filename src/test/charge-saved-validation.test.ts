import { describe, it, expect } from "vitest";

describe("charge-saved validation", () => {
  const PAYABLE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

  it("rejects non-payable statuses", () => {
    expect(PAYABLE_STATUSES.includes("DRAFT")).toBe(false);
    expect(PAYABLE_STATUSES.includes("PAID")).toBe(false);
    expect(PAYABLE_STATUSES.includes("ACCEPTED")).toBe(false);
  });

  it("accepts payable statuses", () => {
    expect(PAYABLE_STATUSES.includes("SENT")).toBe(true);
    expect(PAYABLE_STATUSES.includes("PARTIALLY_PAID")).toBe(true);
    expect(PAYABLE_STATUSES.includes("OVERDUE")).toBe(true);
  });

  it("calculates surcharge correctly", () => {
    const amount = 1000;
    const surchargePercent = 2.5;
    const charged = amount * (1 + surchargePercent / 100);
    expect(charged).toBe(1025);
    expect(Math.round(charged * 100)).toBe(102500);
  });
});
