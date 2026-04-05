import { describe, it, expect } from "vitest";
import { calcDaysOverdue } from "@/inngest/functions/overdue-invoices";

describe("overdue invoice installment guard logic", () => {
  function shouldSkipOverdue(
    status: string,
    partialPayments: { sortOrder: number; isPaid: boolean; dueDate: Date | null }[],
    now: Date,
  ): boolean {
    if (status === "PARTIALLY_PAID" && partialPayments.length > 0) {
      const sorted = [...partialPayments].sort((a, b) => a.sortOrder - b.sortOrder);
      const nextUnpaid = sorted.find((pp) => !pp.isPaid);
      if (nextUnpaid?.dueDate && nextUnpaid.dueDate > now) {
        return true;
      }
    }
    return false;
  }

  const now = new Date("2026-04-01T07:00:00Z");

  it("does not skip SENT invoices", () => {
    expect(shouldSkipOverdue("SENT", [], now)).toBe(false);
  });

  it("does not skip PARTIALLY_PAID with no installments", () => {
    expect(shouldSkipOverdue("PARTIALLY_PAID", [], now)).toBe(false);
  });

  it("skips PARTIALLY_PAID when next installment is in the future", () => {
    const payments = [
      { sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") },
      { sortOrder: 1, isPaid: false, dueDate: new Date("2026-05-01") },
    ];
    expect(shouldSkipOverdue("PARTIALLY_PAID", payments, now)).toBe(true);
  });

  it("does not skip when next installment is past due", () => {
    const payments = [
      { sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") },
      { sortOrder: 1, isPaid: false, dueDate: new Date("2026-03-15") },
    ];
    expect(shouldSkipOverdue("PARTIALLY_PAID", payments, now)).toBe(false);
  });

  it("does not skip when next installment has no due date", () => {
    const payments = [
      { sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") },
      { sortOrder: 1, isPaid: false, dueDate: null },
    ];
    expect(shouldSkipOverdue("PARTIALLY_PAID", payments, now)).toBe(false);
  });

  it("does not skip when all installments are paid", () => {
    const payments = [
      { sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") },
      { sortOrder: 1, isPaid: true, dueDate: new Date("2026-04-01") },
    ];
    expect(shouldSkipOverdue("PARTIALLY_PAID", payments, now)).toBe(false);
  });
});

describe("calcDaysOverdue", () => {
  it("returns 1 for an invoice exactly 1 day overdue", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const due = new Date("2026-03-09T12:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(1);
  });

  it("returns 30 for an invoice 30 days overdue", () => {
    const now = new Date("2026-04-10T00:00:00Z");
    const due = new Date("2026-03-11T00:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(30);
  });

  it("floors partial days (0.75 days overdue → 0)", () => {
    const now = new Date("2026-03-10T06:00:00Z"); // 18h after due
    const due = new Date("2026-03-09T12:00:00Z");
    expect(calcDaysOverdue(now, due)).toBe(0);
  });

  it("returns 0 when due date equals now", () => {
    const now = new Date("2026-03-10T00:00:00Z");
    expect(calcDaysOverdue(now, now)).toBe(0);
  });
});
