// src/test/expenses-bulk-mutations.test.ts
import { describe, it, expect } from "vitest";

type ExpenseStub = { id: string; invoiceLineId: string | null };

export function filterDeletableExpenses(expenses: ExpenseStub[]): ExpenseStub[] {
  return expenses.filter((e) => e.invoiceLineId === null);
}

describe("filterDeletableExpenses", () => {
  it("excludes billed expenses", () => {
    const expenses: ExpenseStub[] = [
      { id: "1", invoiceLineId: null },
      { id: "2", invoiceLineId: "line_1" },
      { id: "3", invoiceLineId: null },
    ];
    const result = filterDeletableExpenses(expenses);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["1", "3"]);
  });
});
