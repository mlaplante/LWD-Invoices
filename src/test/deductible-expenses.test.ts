import { describe, it, expect } from "vitest";
import { aggregateDeductibleExpenses } from "@/server/services/deductible-expenses";

const UNCATEGORIZED = "Uncategorized — review";

describe("aggregateDeductibleExpenses", () => {
  it("returns zeros for an empty list", () => {
    const r = aggregateDeductibleExpenses([]);
    expect(r.deductibleTotal).toBe(0);
    expect(r.nonDeductibleTotal).toBe(0);
    expect(r.uncategorizedTotal).toBe(0);
    expect(r.byCategory).toEqual([]);
  });

  it("excludes uncategorized expenses from the deductible total", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 100, categoryId: null, categoryName: null, deductible: null },
    ]);
    expect(r.deductibleTotal).toBe(0);
    expect(r.uncategorizedTotal).toBe(100);
    expect(r.byCategory).toEqual([
      { category: UNCATEGORIZED, amount: 100, deductible: false },
    ]);
  });

  it("splits deductible from non-deductible categories", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 200, categoryId: "c1", categoryName: "Software", deductible: true },
      { amount: 50, categoryId: "c1", categoryName: "Software", deductible: true },
      { amount: 80, categoryId: "c2", categoryName: "Owner draws", deductible: false },
    ]);
    expect(r.deductibleTotal).toBe(250);
    expect(r.nonDeductibleTotal).toBe(80);
    expect(r.uncategorizedTotal).toBe(0);
    const software = r.byCategory.find((x) => x.category === "Software")!;
    expect(software).toMatchObject({ amount: 250, deductible: true });
  });

  it("sorts categories by amount descending", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 10, categoryId: "c1", categoryName: "Small", deductible: true },
      { amount: 90, categoryId: "c2", categoryName: "Big", deductible: true },
    ]);
    expect(r.byCategory.map((x) => x.category)).toEqual(["Big", "Small"]);
  });
});
