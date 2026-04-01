import { describe, it, expect } from "vitest";
import {
  calculateLateFee,
  shouldApplyLateFee,
  type LateFeeConfig,
  type InvoiceFeeContext,
} from "@/server/services/late-fees";

// ── calculateLateFee ─────────────────────────────────────────────────────────

describe("calculateLateFee", () => {
  it("returns the flat amount for flat fee type", () => {
    expect(calculateLateFee("flat", 25, 1000)).toBe(25);
  });

  it("calculates percentage of invoice total", () => {
    expect(calculateLateFee("percentage", 1.5, 1000)).toBe(15);
  });

  it("returns 0 for zero fee rate", () => {
    expect(calculateLateFee("flat", 0, 1000)).toBe(0);
  });

  it("returns 0 for percentage when invoice total is zero", () => {
    expect(calculateLateFee("percentage", 5, 0)).toBe(0);
  });
});

// ── shouldApplyLateFee ───────────────────────────────────────────────────────

describe("shouldApplyLateFee", () => {
  const baseConfig: LateFeeConfig = {
    enabled: true,
    feeType: "flat",
    feeRate: 25,
    graceDays: 5,
    recurring: false,
    intervalDays: 30,
    maxApplications: null,
  };

  const baseCtx: InvoiceFeeContext = {
    dueDate: new Date("2026-01-01T00:00:00Z"),
    existingFeeCount: 0,
    lastFeeDate: null,
  };

  it("returns false when disabled", () => {
    expect(
      shouldApplyLateFee({ ...baseConfig, enabled: false }, baseCtx, new Date("2026-02-01")),
    ).toBe(false);
  });

  it("returns false when within grace period", () => {
    const now = new Date("2026-01-04T00:00:00Z"); // 3 days after due, grace is 5
    expect(shouldApplyLateFee(baseConfig, baseCtx, now)).toBe(false);
  });

  it("returns true when past grace period with no existing fees", () => {
    const now = new Date("2026-01-07T00:00:00Z"); // 6 days after due, grace is 5
    expect(shouldApplyLateFee(baseConfig, baseCtx, now)).toBe(true);
  });

  it("returns false for non-recurring after first fee applied", () => {
    const ctx: InvoiceFeeContext = {
      ...baseCtx,
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-01-06"),
    };
    const now = new Date("2026-02-10");
    expect(shouldApplyLateFee(baseConfig, ctx, now)).toBe(false);
  });

  it("returns true for recurring when interval has passed", () => {
    const config: LateFeeConfig = { ...baseConfig, recurring: true, intervalDays: 30 };
    const ctx: InvoiceFeeContext = {
      ...baseCtx,
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-01-06T00:00:00Z"),
    };
    const now = new Date("2026-02-06T00:00:00Z"); // exactly 31 days later
    expect(shouldApplyLateFee(config, ctx, now)).toBe(true);
  });

  it("returns false for recurring when interval has not passed", () => {
    const config: LateFeeConfig = { ...baseConfig, recurring: true, intervalDays: 30 };
    const ctx: InvoiceFeeContext = {
      ...baseCtx,
      existingFeeCount: 1,
      lastFeeDate: new Date("2026-01-06T00:00:00Z"),
    };
    const now = new Date("2026-01-20T00:00:00Z"); // only 14 days later
    expect(shouldApplyLateFee(config, ctx, now)).toBe(false);
  });

  it("returns false when max applications reached", () => {
    const config: LateFeeConfig = {
      ...baseConfig,
      recurring: true,
      maxApplications: 3,
    };
    const ctx: InvoiceFeeContext = {
      ...baseCtx,
      existingFeeCount: 3,
      lastFeeDate: new Date("2026-03-01"),
    };
    const now = new Date("2026-04-01");
    expect(shouldApplyLateFee(config, ctx, now)).toBe(false);
  });
});
