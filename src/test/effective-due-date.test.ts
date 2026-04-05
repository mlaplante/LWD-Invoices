import { describe, it, expect } from "vitest";
import { getEffectiveDueDate } from "@/server/services/partial-payments";
import { Prisma } from "@/generated/prisma";

const dec = (n: number) => new Prisma.Decimal(n);

const makePayment = (overrides: Partial<{
  sortOrder: number;
  amount: typeof Prisma.Decimal.prototype;
  isPercentage: boolean;
  dueDate: Date | null;
  isPaid: boolean;
}> = {}) => ({
  sortOrder: 0,
  amount: dec(100),
  isPercentage: false,
  dueDate: null as Date | null,
  isPaid: false,
  ...overrides,
});

describe("getEffectiveDueDate", () => {
  const invoiceDueDate = new Date("2026-03-01");

  it("returns invoice due date when no partial payments", () => {
    expect(getEffectiveDueDate([], invoiceDueDate)).toEqual(invoiceDueDate);
  });

  it("returns invoice due date when all installments are paid", () => {
    const payments = [
      makePayment({ sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") }),
      makePayment({ sortOrder: 1, isPaid: true, dueDate: new Date("2026-04-01") }),
    ];
    expect(getEffectiveDueDate(payments, invoiceDueDate)).toEqual(invoiceDueDate);
  });

  it("returns next unpaid installment due date", () => {
    const nextDue = new Date("2026-04-15");
    const payments = [
      makePayment({ sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") }),
      makePayment({ sortOrder: 1, isPaid: false, dueDate: nextDue }),
      makePayment({ sortOrder: 2, isPaid: false, dueDate: new Date("2026-05-15") }),
    ];
    expect(getEffectiveDueDate(payments, invoiceDueDate)).toEqual(nextDue);
  });

  it("returns invoice due date when next unpaid has no due date", () => {
    const payments = [
      makePayment({ sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") }),
      makePayment({ sortOrder: 1, isPaid: false, dueDate: null }),
    ];
    expect(getEffectiveDueDate(payments, invoiceDueDate)).toEqual(invoiceDueDate);
  });

  it("sorts by sortOrder regardless of array order", () => {
    const nextDue = new Date("2026-04-15");
    const payments = [
      makePayment({ sortOrder: 2, isPaid: false, dueDate: new Date("2026-05-15") }),
      makePayment({ sortOrder: 0, isPaid: true, dueDate: new Date("2026-03-01") }),
      makePayment({ sortOrder: 1, isPaid: false, dueDate: nextDue }),
    ];
    expect(getEffectiveDueDate(payments, invoiceDueDate)).toEqual(nextDue);
  });

  it("returns first installment due date when none are paid", () => {
    const firstDue = new Date("2026-03-15");
    const payments = [
      makePayment({ sortOrder: 0, isPaid: false, dueDate: firstDue }),
      makePayment({ sortOrder: 1, isPaid: false, dueDate: new Date("2026-04-15") }),
    ];
    expect(getEffectiveDueDate(payments, invoiceDueDate)).toEqual(firstDue);
  });
});
