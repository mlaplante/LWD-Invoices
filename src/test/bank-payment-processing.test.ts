import { describe, it, expect } from "vitest";
import {
  BANK_PAYMENT_PROCESSING_MAX_DAYS,
  notSettlingBankPayment,
} from "@/server/lib/bank-payment-processing";

describe("notSettlingBankPayment", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("matches invoices with no bank debit in flight", () => {
    const where = notSettlingBankPayment(now);
    expect(where.OR).toContainEqual({ bankPaymentProcessingAt: null });
  });

  it("only exempts debits flagged within the settlement window", () => {
    const where = notSettlingBankPayment(now);
    const cutoff = new Date(now.getTime() - BANK_PAYMENT_PROCESSING_MAX_DAYS * 86_400_000);
    expect(where.OR).toContainEqual({ bankPaymentProcessingAt: { lt: cutoff } });
  });

  it("uses a window longer than the slowest (SEPA) settlement", () => {
    expect(BANK_PAYMENT_PROCESSING_MAX_DAYS).toBeGreaterThanOrEqual(21);
  });
});
