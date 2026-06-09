import { describe, it, expect } from "vitest";
import { attributeIncomeByCategory } from "@/server/services/income-by-category";

describe("attributeIncomeByCategory", () => {
  it("returns empty when there are no payments", () => {
    const r = attributeIncomeByCategory([]);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("attributes income ex-tax: uses line subtotal, not tax-inclusive total", () => {
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 110,
        invoiceTotal: 110,
        lines: [{ name: "Design", subtotal: 100 }],
      },
    ]);
    expect(r.total).toBeCloseTo(100, 5);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ category: "Design", amount: 100, invoiceCount: 1 });
    expect(r.rows[0].pct).toBeCloseTo(100, 5);
  });

  it("prorates a partial payment across lines by subtotal share", () => {
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 100,
        invoiceTotal: 200,
        lines: [
          { name: "Design", subtotal: 100 },
          { name: "Hosting", subtotal: 100 },
        ],
      },
    ]);
    expect(r.total).toBeCloseTo(100, 5);
    const design = r.rows.find((x) => x.category === "Design")!;
    const hosting = r.rows.find((x) => x.category === "Hosting")!;
    expect(design.amount).toBeCloseTo(50, 5);
    expect(hosting.amount).toBeCloseTo(50, 5);
  });

  it("merges lines with the same name across invoices and counts distinct invoices", () => {
    const r = attributeIncomeByCategory([
      { invoiceId: "i1", amount: 100, invoiceTotal: 100, lines: [{ name: "Design", subtotal: 100 }] },
      { invoiceId: "i2", amount: 100, invoiceTotal: 100, lines: [{ name: "Design", subtotal: 100 }] },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBeCloseTo(200, 5);
    expect(r.rows[0].invoiceCount).toBe(2);
  });

  it("buckets blank line names as Uncategorized and skips zero-total invoices", () => {
    const r = attributeIncomeByCategory([
      { invoiceId: "z", amount: 0, invoiceTotal: 0, lines: [{ name: "X", subtotal: 0 }] },
      { invoiceId: "i1", amount: 50, invoiceTotal: 50, lines: [{ name: "  ", subtotal: 50 }] },
    ]);
    expect(r.total).toBeCloseTo(50, 5);
    expect(r.rows[0].category).toBe("Uncategorized");
  });

  it("sorts rows by amount descending", () => {
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 300,
        invoiceTotal: 300,
        lines: [
          { name: "Small", subtotal: 100 },
          { name: "Big", subtotal: 200 },
        ],
      },
    ]);
    expect(r.rows.map((x) => x.category)).toEqual(["Big", "Small"]);
  });
});
