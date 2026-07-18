import { describe, expect, it } from "vitest";
import { resolvePaymentStatus } from "@/server/services/invoice-balance";

describe("resolvePaymentStatus", () => {
  it("returns PARTIALLY_PAID when payments cover less than total", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 40, creditApplied: 0 }),
    ).toBe("PARTIALLY_PAID");
  });

  it("returns PAID when payments cover the total exactly", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 100, creditApplied: 0 }),
    ).toBe("PAID");
  });

  it("returns PAID on overpayment", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 120, creditApplied: 0 }),
    ).toBe("PAID");
  });

  it("counts credit-note applications toward the balance", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 60, creditApplied: 40 }),
    ).toBe("PAID");
  });

  it("tolerates floating-point residue under a cent", () => {
    expect(
      resolvePaymentStatus({ total: 100, paymentsSum: 99.999, creditApplied: 0 }),
    ).toBe("PAID");
  });
});
