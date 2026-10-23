import { describe, it, expect } from "vitest";
import { isBankPaymentProcessing } from "@/lib/invoice-ui";

describe("isBankPaymentProcessing", () => {
  const at = "2026-10-22T16:43:17.000Z";

  it("is true for a payable invoice with a pending bank debit", () => {
    expect(isBankPaymentProcessing({ status: "SENT", bankPaymentProcessingAt: at })).toBe(true);
    expect(isBankPaymentProcessing({ status: "OVERDUE", bankPaymentProcessingAt: new Date(at) })).toBe(true);
    expect(isBankPaymentProcessing({ status: "PARTIALLY_PAID", bankPaymentProcessingAt: at })).toBe(true);
  });

  it("is false without a pending bank debit", () => {
    expect(isBankPaymentProcessing({ status: "SENT", bankPaymentProcessingAt: null })).toBe(false);
    expect(isBankPaymentProcessing({ status: "SENT" })).toBe(false);
  });

  it("ignores a stale marker once the invoice is no longer payable", () => {
    expect(isBankPaymentProcessing({ status: "PAID", bankPaymentProcessingAt: at })).toBe(false);
    expect(isBankPaymentProcessing({ status: "DRAFT", bankPaymentProcessingAt: at })).toBe(false);
  });
});
