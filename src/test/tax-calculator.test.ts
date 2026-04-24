import { describe, it, expect } from "vitest";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type LineInput,
  type TaxInput,
} from "@/server/services/tax-calculator";
import { LineType } from "@/generated/prisma";

describe("Tax Calculator", () => {
  const TAX_13 = { id: "tax_13", rate: 13, isCompound: false };
  const TAX_5 = { id: "tax_5", rate: 5, isCompound: false };
  const TAX_GST = { id: "tax_gst", rate: 5, isCompound: true };
  const TAX_PST = { id: "tax_pst", rate: 7, isCompound: true };

  describe("calculateLineTotals", () => {
    it("calculates basic line total with single tax", () => {
      const line: LineInput = {
        qty: 2,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(200);
      expect(result.taxTotal).toBe(26); // 200 * 0.13
      expect(result.total).toBe(226);
      expect(result.taxBreakdown).toHaveLength(1);
      expect(result.taxBreakdown[0]).toEqual({ taxId: "tax_13", taxAmount: 26 });
    });

    it("handles zero quantity", () => {
      const line: LineInput = {
        qty: 0,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(0);
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("applies percentage discount before tax", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 10, // 10% discount
        discountIsPercentage: true,
        taxIds: ["tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(90); // 100 - 10%
      expect(result.taxTotal).toBe(11.7); // 90 * 0.13
      expect(result.total).toBe(101.7);
    });

    it("applies fixed discount before tax", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 15,
        discountIsPercentage: false,
        taxIds: ["tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(85);
      expect(result.taxTotal).toBe(11.05); // 85 * 0.13
      expect(result.total).toBe(96.05);
    });

    it("handles multiple non-compound taxes", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_5", "tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_5, TAX_13]);

      expect(result.subtotal).toBe(100);
      expect(result.taxTotal).toBe(18); // (100 * 0.05) + (100 * 0.13)
      expect(result.total).toBe(118);
      expect(result.taxBreakdown).toHaveLength(2);
    });

    it("handles compound taxes in order", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_gst", "tax_pst"],
      };

      const result = calculateLineTotals(line, [TAX_GST, TAX_PST]);

      // GST: 100 * 0.05 = 5
      // PST: (100 + 5) * 0.07 = 7.35
      expect(result.subtotal).toBe(100);
      expect(result.taxBreakdown[0]).toEqual({ taxId: "tax_gst", taxAmount: 5 });
      expect(result.taxBreakdown[1]).toEqual({
        taxId: "tax_pst",
        taxAmount: 7.35,
      });
      expect(result.taxTotal).toBe(12.35);
      expect(result.total).toBe(112.35);
    });

    it("handles mixed non-compound and compound taxes", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_5", "tax_gst"],
      };

      const result = calculateLineTotals(line, [TAX_5, TAX_GST]);

      // Non-compound: 100 * 0.05 = 5
      // Compound: (100 + 5) * 0.05 = 5.25
      expect(result.subtotal).toBe(100);
      expect(result.taxBreakdown[0]).toEqual({ taxId: "tax_5", taxAmount: 5 });
      expect(result.taxBreakdown[1]).toEqual({
        taxId: "tax_gst",
        taxAmount: 5.25,
      });
      expect(result.taxTotal).toBe(10.25);
    });

    it("handles period types (monthly rates)", () => {
      const line: LineInput = {
        qty: 1,
        rate: 1000, // per month
        period: 3, // 3 months
        lineType: LineType.PERIOD_MONTH,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_13"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(3000); // 1000 * 3
      expect(result.taxTotal).toBe(390); // 3000 * 0.13
    });

    it("handles percentage discount line type", () => {
      const line: LineInput = {
        qty: 0,
        rate: 10, // represents 10% discount
        lineType: LineType.PERCENTAGE_DISCOUNT,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = calculateLineTotals(line, []);

      expect(result.subtotal).toBe(0);
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles fixed discount line type", () => {
      const line: LineInput = {
        qty: 0,
        rate: 50, // $50 fixed discount
        lineType: LineType.FIXED_DISCOUNT,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = calculateLineTotals(line, []);

      expect(result.subtotal).toBe(-50);
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(-50);
    });

    it("returns zero taxes when no applicable taxes", () => {
      const line: LineInput = {
        qty: 1,
        rate: 100,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_missing"],
      };

      const result = calculateLineTotals(line, [TAX_13]);

      expect(result.subtotal).toBe(100);
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(100);
    });

    it("handles other period types", () => {
      const dayLine: LineInput = {
        qty: 2,
        rate: 50,
        period: 30,
        lineType: LineType.PERIOD_DAY,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = calculateLineTotals(dayLine, []);
      expect(result.subtotal).toBe(3000); // 2 * 50 * 30
    });
  });

  describe("calculateInvoiceTotals", () => {
    it("sums single line without discount", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_13]);

      expect(result.subtotal).toBe(100);
      expect(result.taxTotal).toBe(13);
      expect(result.discountTotal).toBe(0);
      expect(result.total).toBe(113);
    });

    it("sums multiple lines", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
        {
          qty: 2,
          rate: 50,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_13]);

      expect(result.subtotal).toBe(200); // 100 + 100
      expect(result.taxTotal).toBe(26); // 200 * 0.13
      expect(result.total).toBe(226);
    });

    it("handles percentage discount line", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
        {
          qty: 0,
          rate: 10, // 10% discount
          lineType: LineType.PERCENTAGE_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_13]);

      expect(result.subtotal).toBe(100);
      expect(result.discountTotal).toBe(10); // 100 * 10%
      expect(result.taxTotal).toBe(13); // Tax applies to full subtotal before discount
      expect(result.total).toBe(103); // 100 - 10 + 13
    });

    it("handles fixed discount line", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
        {
          qty: 0,
          rate: 20, // $20 discount
          lineType: LineType.FIXED_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_13]);

      expect(result.subtotal).toBe(100);
      expect(result.discountTotal).toBe(20);
      expect(result.taxTotal).toBe(13); // Tax applies to full subtotal before discount
      expect(result.total).toBe(93); // 100 - 20 + 13
    });

    it("applies percentage discount to running subtotal", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
        {
          qty: 0,
          rate: 10, // 10% off everything above
          lineType: LineType.PERCENTAGE_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, []);

      expect(result.subtotal).toBe(200);
      expect(result.discountTotal).toBe(20); // 200 * 10%
      expect(result.total).toBe(180);
    });

    it("handles empty invoice", () => {
      const result = calculateInvoiceTotals([], []);

      expect(result.subtotal).toBe(0);
      expect(result.discountTotal).toBe(0);
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles multiple discounts", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
        {
          qty: 0,
          rate: 10, // 10% discount
          lineType: LineType.PERCENTAGE_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
        {
          qty: 0,
          rate: 5, // $5 discount
          lineType: LineType.FIXED_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, []);

      expect(result.subtotal).toBe(100);
      expect(result.discountTotal).toBe(15); // 10 + 5
      expect(result.total).toBe(85);
    });

    it("applies taxes on line subtotal regardless of later discounts", () => {
      const lines: LineInput[] = [
        {
          qty: 1,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
        {
          qty: 0,
          rate: 20, // $20 discount
          lineType: LineType.FIXED_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_13]);

      // Subtotal: 100, Discount: 20, Tax on full 100 (not discounted amount)
      expect(result.subtotal).toBe(100);
      expect(result.discountTotal).toBe(20);
      expect(result.taxTotal).toBe(13); // 100 * 0.13 (tax applies before discount)
      expect(result.total).toBe(93); // 100 - 20 + 13
    });

    it("handles complex invoice with mixed taxes and discounts", () => {
      const lines: LineInput[] = [
        {
          qty: 2,
          rate: 100,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_5"],
        },
        {
          qty: 1,
          rate: 200,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: ["tax_13"],
        },
        {
          qty: 0,
          rate: 10, // 10% discount
          lineType: LineType.PERCENTAGE_DISCOUNT,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        },
      ];

      const result = calculateInvoiceTotals(lines, [TAX_5, TAX_13]);

      // First line: 200, tax: 10 (200 * 0.05)
      // Second line: 200, tax: 26 (200 * 0.13)
      // Subtotal: 400, Total tax: 36
      // Discount: 10% of 400 = 40
      // Final: 400 - 40 + 36 = 396
      expect(result.subtotal).toBe(400);
      expect(result.discountTotal).toBe(40); // 400 * 10%
      expect(result.taxTotal).toBe(36); // 200*0.05 + 200*0.13
      expect(result.total).toBe(396); // 400 - 40 + 36
    });
  });
});
