import { describe, it, expect } from "vitest";
import {
  calculateDrawdownAmount,
  validateDeposit,
  validateDrawdown,
} from "@/server/services/retainers";

// ── calculateDrawdownAmount ─────────────────────────────────────────────────

describe("calculateDrawdownAmount", () => {
  it("returns retainer balance when it is less than remaining", () => {
    expect(calculateDrawdownAmount(100, 500, 0, 0)).toBe(100);
  });

  it("returns remaining when it is less than retainer balance", () => {
    expect(calculateDrawdownAmount(1000, 500, 200, 0)).toBe(300);
  });

  it("returns 0 when retainer balance is 0", () => {
    expect(calculateDrawdownAmount(0, 500, 0, 0)).toBe(0);
  });

  it("returns 0 when invoice is fully paid", () => {
    expect(calculateDrawdownAmount(100, 500, 500, 0)).toBe(0);
  });

  it("accounts for retainer already applied", () => {
    // Invoice 500, paid 100, retainer already applied 200 => remaining 200
    expect(calculateDrawdownAmount(300, 500, 100, 200)).toBe(200);
  });

  it("returns 0 when retainer balance is negative", () => {
    expect(calculateDrawdownAmount(-10, 500, 0, 0)).toBe(0);
  });
});

// ── validateDeposit ─────────────────────────────────────────────────────────

describe("validateDeposit", () => {
  it("returns null for a valid deposit", () => {
    expect(validateDeposit({ amount: 100, method: "bank_transfer" })).toBeNull();
  });

  it("rejects zero amount", () => {
    expect(validateDeposit({ amount: 0 })).toBe("Deposit amount must be greater than zero");
  });

  it("rejects negative amount", () => {
    expect(validateDeposit({ amount: -50 })).toBe("Deposit amount must be greater than zero");
  });

  it("rejects Infinity", () => {
    expect(validateDeposit({ amount: Infinity })).toBe("Deposit amount must be a finite number");
  });
});

// ── validateDrawdown ────────────────────────────────────────────────────────

describe("validateDrawdown", () => {
  const base = {
    retainerBalance: 500,
    invoiceTotal: 1000,
    invoicePaid: 0,
    retainerAlreadyApplied: 0,
    requestedAmount: 200,
  };

  it("returns null for a valid drawdown", () => {
    expect(validateDrawdown(base)).toBeNull();
  });

  it("rejects zero amount", () => {
    expect(validateDrawdown({ ...base, requestedAmount: 0 })).toBe(
      "Drawdown amount must be greater than zero",
    );
  });

  it("rejects negative amount", () => {
    expect(validateDrawdown({ ...base, requestedAmount: -10 })).toBe(
      "Drawdown amount must be greater than zero",
    );
  });

  it("rejects amount exceeding retainer balance", () => {
    expect(validateDrawdown({ ...base, requestedAmount: 600 })).toBe(
      "Drawdown amount exceeds retainer balance",
    );
  });

  it("rejects when invoice is fully paid", () => {
    expect(validateDrawdown({ ...base, invoicePaid: 1000, requestedAmount: 100 })).toBe(
      "Invoice is already fully paid",
    );
  });

  it("rejects amount exceeding remaining invoice balance", () => {
    // Remaining = 1000 - 800 - 0 = 200, but requesting 300
    expect(
      validateDrawdown({ ...base, invoicePaid: 800, requestedAmount: 300 }),
    ).toBe("Drawdown amount exceeds invoice remaining balance");
  });
});
