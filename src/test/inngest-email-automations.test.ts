import { describe, it, expect } from "vitest";
import {
  shouldSendAutomation,
  getEligibleInvoicesForTrigger,
} from "@/inngest/functions/email-automations";

describe("shouldSendAutomation", () => {
  const baseDate = new Date("2026-03-01T09:00:00Z");

  it("returns true when delay has passed", () => {
    const triggerDate = new Date("2026-02-25T09:00:00Z"); // 4 days ago
    expect(shouldSendAutomation(triggerDate, 3, baseDate)).toBe(true);
  });

  it("returns false when delay has not passed", () => {
    const triggerDate = new Date("2026-02-28T09:00:00Z"); // 1 day ago
    expect(shouldSendAutomation(triggerDate, 3, baseDate)).toBe(false);
  });

  it("returns true for immediate (0 delay)", () => {
    const triggerDate = new Date("2026-03-01T08:00:00Z"); // earlier today
    expect(shouldSendAutomation(triggerDate, 0, baseDate)).toBe(true);
  });

  it("returns true at exact boundary", () => {
    const triggerDate = new Date("2026-02-26T09:00:00Z"); // exactly 3 days ago
    expect(shouldSendAutomation(triggerDate, 3, baseDate)).toBe(true);
  });

  it("returns false just before boundary", () => {
    const triggerDate = new Date("2026-02-26T09:00:01Z"); // 3 days minus 1 second
    expect(shouldSendAutomation(triggerDate, 3, baseDate)).toBe(false);
  });
});

describe("getEligibleInvoicesForTrigger", () => {
  describe("PAYMENT_RECEIVED", () => {
    it("returns last payment date", () => {
      const invoice = {
        status: "PAID",
        payments: [
          { paidAt: new Date("2026-02-20T10:00:00Z") },
          { paidAt: new Date("2026-02-25T10:00:00Z") },
        ],
      };
      const result = getEligibleInvoicesForTrigger("PAYMENT_RECEIVED", invoice);
      expect(result).toEqual(new Date("2026-02-25T10:00:00Z"));
    });

    it("returns null when no payments", () => {
      const invoice = { status: "SENT", payments: [] };
      expect(getEligibleInvoicesForTrigger("PAYMENT_RECEIVED", invoice)).toBeNull();
    });
  });

  describe("INVOICE_SENT", () => {
    it("returns lastSent date", () => {
      const date = new Date("2026-03-01T10:00:00Z");
      const invoice = { status: "SENT", lastSent: date };
      expect(getEligibleInvoicesForTrigger("INVOICE_SENT", invoice)).toEqual(date);
    });

    it("returns null when not sent", () => {
      const invoice = { status: "DRAFT", lastSent: null };
      expect(getEligibleInvoicesForTrigger("INVOICE_SENT", invoice)).toBeNull();
    });
  });

  describe("INVOICE_VIEWED", () => {
    it("returns lastViewed date", () => {
      const date = new Date("2026-03-01T15:00:00Z");
      const invoice = { status: "SENT", lastViewed: date };
      expect(getEligibleInvoicesForTrigger("INVOICE_VIEWED", invoice)).toEqual(date);
    });

    it("returns null when not viewed", () => {
      const invoice = { status: "SENT", lastViewed: null };
      expect(getEligibleInvoicesForTrigger("INVOICE_VIEWED", invoice)).toBeNull();
    });
  });

  describe("INVOICE_OVERDUE", () => {
    it("returns dueDate when status is OVERDUE", () => {
      const dueDate = new Date("2026-02-15T00:00:00Z");
      const invoice = { status: "OVERDUE", dueDate };
      expect(getEligibleInvoicesForTrigger("INVOICE_OVERDUE", invoice)).toEqual(dueDate);
    });

    it("returns null when status is not OVERDUE", () => {
      const invoice = {
        status: "SENT",
        dueDate: new Date("2026-02-15T00:00:00Z"),
      };
      expect(getEligibleInvoicesForTrigger("INVOICE_OVERDUE", invoice)).toBeNull();
    });

    it("returns null when no dueDate", () => {
      const invoice = { status: "OVERDUE", dueDate: null };
      expect(getEligibleInvoicesForTrigger("INVOICE_OVERDUE", invoice)).toBeNull();
    });
  });
});
