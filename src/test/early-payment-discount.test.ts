import { describe, it, expect } from "vitest";
import {
  computeEarlyPayRedemption,
  earlyPayDiscountLabel,
  getEarlyPayDeadline,
  resolveEarlyPayOffer,
} from "@/server/services/early-payment-discount";

const baseOffer = {
  percent: 2,
  days: 10,
  invoiceDate: new Date("2026-06-01T15:30:00Z"),
  status: "SENT",
  total: 1000,
  paidSoFar: 0,
  hasInstallments: false,
  redeemedAt: null,
  now: new Date("2026-06-05T12:00:00Z"),
};

describe("getEarlyPayDeadline", () => {
  it("is end of day UTC, `days` after the invoice date", () => {
    const deadline = getEarlyPayDeadline(new Date("2026-06-01T15:30:00Z"), 10);
    expect(deadline.toISOString()).toBe("2026-06-11T23:59:59.999Z");
  });
});

describe("resolveEarlyPayOffer", () => {
  it("returns the offer with 2% off the balance inside the window", () => {
    const offer = resolveEarlyPayOffer(baseOffer);
    expect(offer).not.toBeNull();
    expect(offer!.discountAmount).toBe(20);
    expect(offer!.discountedBalance).toBe(980);
    expect(offer!.balance).toBe(1000);
  });

  it("is null after the deadline", () => {
    expect(
      resolveEarlyPayOffer({ ...baseOffer, now: new Date("2026-06-12T00:00:00Z") }),
    ).toBeNull();
  });

  it("still applies on the deadline's last instant", () => {
    expect(
      resolveEarlyPayOffer({ ...baseOffer, now: new Date("2026-06-11T23:59:59.999Z") }),
    ).not.toBeNull();
  });

  it("is null when no snapshot, already redeemed, or installment plan exists", () => {
    expect(resolveEarlyPayOffer({ ...baseOffer, percent: null })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, percent: 0 })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, days: null })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, redeemedAt: new Date() })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, hasInstallments: true })).toBeNull();
  });

  it("is null for non-payable statuses", () => {
    expect(resolveEarlyPayOffer({ ...baseOffer, status: "DRAFT" })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, status: "PAID" })).toBeNull();
    expect(resolveEarlyPayOffer({ ...baseOffer, status: "ACCEPTED" })).toBeNull();
  });

  it("discounts the remaining balance when partially paid", () => {
    const offer = resolveEarlyPayOffer({ ...baseOffer, status: "PARTIALLY_PAID", paidSoFar: 400 });
    expect(offer!.balance).toBe(600);
    expect(offer!.discountAmount).toBe(12);
    expect(offer!.discountedBalance).toBe(588);
  });

  it("is null once the balance reaches zero", () => {
    expect(resolveEarlyPayOffer({ ...baseOffer, paidSoFar: 1000 })).toBeNull();
  });

  it("rounds to cents", () => {
    const offer = resolveEarlyPayOffer({ ...baseOffer, total: 333.33 });
    expect(offer!.discountAmount).toBe(6.67);
    expect(offer!.discountedBalance).toBe(326.66);
  });
});

describe("computeEarlyPayRedemption", () => {
  it("books the discounted balance as payment and the rest as surcharge", () => {
    const r = computeEarlyPayRedemption({
      invoiceTotal: 1000,
      existingPaid: 0,
      discountAmount: 20,
      // 980 discounted balance + 3% card surcharge
      chargedAmount: 1009.4,
    });
    expect(r.newInvoiceTotal).toBe(980);
    expect(r.paymentAmount).toBe(980);
    expect(r.surchargeAmount).toBe(29.4);
  });

  it("handles partially-paid invoices", () => {
    const r = computeEarlyPayRedemption({
      invoiceTotal: 1000,
      existingPaid: 400,
      discountAmount: 12,
      chargedAmount: 588,
    });
    expect(r.newInvoiceTotal).toBe(988);
    expect(r.paymentAmount).toBe(588);
    expect(r.surchargeAmount).toBe(0);
  });

  it("never produces negative amounts", () => {
    const r = computeEarlyPayRedemption({
      invoiceTotal: 100,
      existingPaid: 150,
      discountAmount: 2,
      chargedAmount: 0,
    });
    expect(r.paymentAmount).toBe(0);
    expect(r.surchargeAmount).toBe(0);
  });
});

describe("earlyPayDiscountLabel", () => {
  it("formats the human label", () => {
    expect(earlyPayDiscountLabel(2, 10)).toBe("Early payment discount (2% — paid within 10 days)");
    expect(earlyPayDiscountLabel(1.5, 1)).toBe("Early payment discount (1.5% — paid within 1 day)");
  });
});
