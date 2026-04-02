import { describe, it, expect } from "vitest";
import {
  calculateInvoiceTotalsWithDiscount,
  calculateInvoiceTotals,
  type LineInput,
  type TaxInput,
} from "@/server/services/tax-calculator";
import { LineType } from "@/generated/prisma";

function stdLine(rate: number, qty = 1, taxIds: string[] = []): LineInput {
  return {
    qty,
    rate,
    lineType: LineType.STANDARD,
    discount: 0,
    discountIsPercentage: false,
    taxIds,
  };
}

const tax13: TaxInput = { id: "tax13", rate: 13, isCompound: false };
const tax5compound: TaxInput = { id: "tax5c", rate: 5, isCompound: true };

describe("calculateInvoiceTotalsWithDiscount", () => {
  it("no discount returns same as base", () => {
    const lines = [stdLine(100, 2)];
    const base = calculateInvoiceTotals(lines, []);
    const withDisc = calculateInvoiceTotalsWithDiscount(lines, [], null, 0);
    expect(withDisc.subtotal).toBe(base.subtotal);
    expect(withDisc.taxTotal).toBe(base.taxTotal);
    expect(withDisc.total).toBe(base.total);
    expect(withDisc.invoiceDiscount).toBe(0);
  });

  it("fixed discount before tax: subtotal=200, discount=50, tax=13%", () => {
    // subtotal = 200, discount = 50, taxable = 150, tax = 150 * 0.13 = 19.50
    // total = 200 - 50 + 19.50 = 169.50
    const lines = [stdLine(100, 2, ["tax13"])];
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "fixed", 50);
    expect(result.subtotal).toBe(200);
    expect(result.invoiceDiscount).toBe(50);
    expect(result.taxTotal).toBe(19.5);
    expect(result.total).toBe(169.5);
  });

  it("percentage discount before tax: 10% of 200", () => {
    // subtotal = 200, discount = 20, taxable = 180, tax = 180 * 0.13 = 23.40
    // total = 200 - 20 + 23.40 = 203.40
    const lines = [stdLine(100, 2, ["tax13"])];
    const result = calculateInvoiceTotalsWithDiscount(lines, [tax13], "percentage", 10);
    expect(result.subtotal).toBe(200);
    expect(result.invoiceDiscount).toBe(20);
    expect(result.taxTotal).toBe(23.4);
    expect(result.total).toBe(203.4);
  });

  it("caps fixed discount at subtotal", () => {
    const lines = [stdLine(50, 1)];
    const result = calculateInvoiceTotalsWithDiscount(lines, [], "fixed", 999);
    expect(result.invoiceDiscount).toBe(50);
    expect(result.total).toBe(0);
  });

  it("caps percentage at 100%", () => {
    const lines = [stdLine(100, 2)];
    const result = calculateInvoiceTotalsWithDiscount(lines, [], "percentage", 150);
    expect(result.invoiceDiscount).toBe(200);
    expect(result.total).toBe(0);
  });

  it("compound taxes + discount", () => {
    // subtotal = 200, discount = 40 (20%), taxable = 160
    // non-compound 13%: 160 * 0.13 = 20.80
    // compound 5%: (160 + 20.80) * 0.05 = 9.04
    // tax total = 29.84
    // total = 200 - 40 + 29.84 = 189.84
    const lines = [stdLine(100, 2, ["tax13", "tax5c"])];
    const result = calculateInvoiceTotalsWithDiscount(
      lines,
      [tax13, tax5compound],
      "percentage",
      20
    );
    expect(result.subtotal).toBe(200);
    expect(result.invoiceDiscount).toBe(40);
    expect(result.taxTotal).toBe(29.84);
    expect(result.total).toBe(189.84);
  });

  it("stacks with line-item discounts", () => {
    // Line: qty=2, rate=100, line discount=10% => line subtotal = 180
    // Invoice discount: fixed 30, taxable = 150, tax = 150 * 0.13 = 19.50
    // total = 180 - 30 + 19.50 = 169.50
    const line: LineInput = {
      qty: 2,
      rate: 100,
      lineType: LineType.STANDARD,
      discount: 10,
      discountIsPercentage: true,
      taxIds: ["tax13"],
    };
    const result = calculateInvoiceTotalsWithDiscount([line], [tax13], "fixed", 30);
    expect(result.subtotal).toBe(180);
    expect(result.invoiceDiscount).toBe(30);
    expect(result.taxTotal).toBe(19.5);
    expect(result.total).toBe(169.5);
  });
});
