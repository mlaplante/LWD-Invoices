import { describe, it, expect, beforeEach, vi } from "vitest";
import { LineType, InvoiceStatus } from "@/generated/prisma";
import type { TaxInput, LineInput } from "@/server/services/tax-calculator";

// Mock Prisma
vi.mock("@/server/db", () => ({
  db: {
    tax: {
      findMany: vi.fn(),
    },
  },
}));

// Helper functions extracted from invoices.ts
// These are the functions we're testing in isolation

function toLineInput(line: {
  qty: number;
  rate: number;
  period?: number;
  lineType: LineType;
  discount: number;
  discountIsPercentage: boolean;
  taxIds: string[];
}): LineInput {
  return {
    qty: line.qty,
    rate: line.rate,
    period: line.period,
    lineType: line.lineType,
    discount: line.discount,
    discountIsPercentage: line.discountIsPercentage,
    taxIds: line.taxIds,
  };
}

function buildTaxInputs(taxMap: Map<string, TaxInput>, taxIds: string[]): TaxInput[] {
  return taxIds.flatMap((id) => {
    const t = taxMap.get(id);
    return t ? [t] : [];
  });
}

describe("Invoices Router Helpers", () => {
  describe("toLineInput", () => {
    it("converts schema line to LineInput with all fields", () => {
      const line = {
        qty: 2,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 10,
        discountIsPercentage: true,
        taxIds: ["tax_1", "tax_2"],
      };

      const result = toLineInput(line);

      expect(result).toEqual({
        qty: 2,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 10,
        discountIsPercentage: true,
        taxIds: ["tax_1", "tax_2"],
      });
    });

    it("includes period when provided", () => {
      const line = {
        qty: 1,
        rate: 1000,
        period: 12,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.period).toBe(12);
    });

    it("handles zero rate and quantity", () => {
      const line = {
        qty: 0,
        rate: 0,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.qty).toBe(0);
      expect(result.rate).toBe(0);
    });

    it("preserves line type", () => {
      const standardLine = {
        qty: 1,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      expect(toLineInput(standardLine).lineType).toBe(LineType.STANDARD);
    });

    it("handles flat discount amount", () => {
      const line = {
        qty: 10,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 50,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.discount).toBe(50);
      expect(result.discountIsPercentage).toBe(false);
    });

    it("handles percentage discount", () => {
      const line = {
        qty: 10,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 15,
        discountIsPercentage: true,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.discount).toBe(15);
      expect(result.discountIsPercentage).toBe(true);
    });

    it("preserves empty tax ID array", () => {
      const line = {
        qty: 1,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.taxIds).toEqual([]);
    });

    it("preserves multiple tax IDs", () => {
      const line = {
        qty: 1,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_1", "tax_2", "tax_3"],
      };

      const result = toLineInput(line);

      expect(result.taxIds).toEqual(["tax_1", "tax_2", "tax_3"]);
    });

    it("handles large rate and quantity values", () => {
      const line = {
        qty: 1000,
        rate: 999999.99,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.qty).toBe(1000);
      expect(result.rate).toBe(999999.99);
    });

    it("handles fractional discount amounts", () => {
      const line = {
        qty: 5,
        rate: 100.50,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 12.99,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.rate).toBe(100.50);
      expect(result.discount).toBe(12.99);
    });
  });

  describe("buildTaxInputs", () => {
    let taxMap: Map<string, TaxInput>;

    beforeEach(() => {
      taxMap = new Map([
        [
          "tax_1",
          {
            id: "tax_1",
            rate: 0.1,
            isCompound: false,
          },
        ],
        [
          "tax_2",
          {
            id: "tax_2",
            rate: 0.05,
            isCompound: true,
          },
        ],
        [
          "tax_3",
          {
            id: "tax_3",
            rate: 0.08,
            isCompound: false,
          },
        ],
      ]);
    });

    it("returns empty array when no tax IDs provided", () => {
      const result = buildTaxInputs(taxMap, []);

      expect(result).toEqual([]);
    });

    it("returns single tax when one ID provided", () => {
      const result = buildTaxInputs(taxMap, ["tax_1"]);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("tax_1");
      expect(result[0]?.rate).toBe(0.1);
    });

    it("returns multiple taxes in order", () => {
      const result = buildTaxInputs(taxMap, ["tax_1", "tax_2", "tax_3"]);

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe("tax_1");
      expect(result[1]?.id).toBe("tax_2");
      expect(result[2]?.id).toBe("tax_3");
    });

    it("skips missing tax IDs", () => {
      const result = buildTaxInputs(taxMap, ["tax_1", "tax_missing", "tax_3"]);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("tax_1");
      expect(result[1]?.id).toBe("tax_3");
    });

    it("returns empty when all tax IDs are missing", () => {
      const result = buildTaxInputs(taxMap, ["tax_missing", "tax_also_missing"]);

      expect(result).toEqual([]);
    });

    it("handles duplicate tax IDs", () => {
      const result = buildTaxInputs(taxMap, ["tax_1", "tax_1", "tax_2"]);

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe("tax_1");
      expect(result[1]?.id).toBe("tax_1");
      expect(result[2]?.id).toBe("tax_2");
    });

    it("preserves compound tax flag", () => {
      const result = buildTaxInputs(taxMap, ["tax_2"]);

      expect(result[0]?.isCompound).toBe(true);
    });

    it("preserves non-compound tax flag", () => {
      const result = buildTaxInputs(taxMap, ["tax_1"]);

      expect(result[0]?.isCompound).toBe(false);
    });

    it("handles mixed compound and non-compound taxes", () => {
      const result = buildTaxInputs(taxMap, ["tax_1", "tax_2", "tax_3"]);

      expect(result[0]?.isCompound).toBe(false);
      expect(result[1]?.isCompound).toBe(true);
      expect(result[2]?.isCompound).toBe(false);
    });

    it("returns taxes with correct rates", () => {
      const result = buildTaxInputs(taxMap, ["tax_1", "tax_2", "tax_3"]);

      expect(result[0]?.rate).toBe(0.1);
      expect(result[1]?.rate).toBe(0.05);
      expect(result[2]?.rate).toBe(0.08);
    });

    it("handles empty tax map", () => {
      const emptyMap = new Map<string, TaxInput>();
      const result = buildTaxInputs(emptyMap, ["tax_1", "tax_2"]);

      expect(result).toEqual([]);
    });

    it("handles large number of tax IDs", () => {
      // Add 97 more taxes to reach 100
      for (let i = 4; i <= 100; i++) {
        taxMap.set(`tax_${i}`, {
          id: `tax_${i}`,
          rate: 0.01 * i,
          isCompound: i % 2 === 0,
        });
      }

      const allIds = Array.from(taxMap.keys());
      const result = buildTaxInputs(taxMap, allIds);

      expect(result).toHaveLength(100);
      expect(result[0]?.id).toBe("tax_1");
      expect(result[99]?.id).toBe("tax_100");
    });

    it("maintains insertion order when taxes exist", () => {
      const result = buildTaxInputs(taxMap, ["tax_3", "tax_1", "tax_2"]);

      expect(result[0]?.id).toBe("tax_3");
      expect(result[1]?.id).toBe("tax_1");
      expect(result[2]?.id).toBe("tax_2");
    });

    it("handles single-character and long IDs", () => {
      const customMap = new Map<string, TaxInput>([
        ["a", { id: "a", rate: 0.1, isCompound: false }],
        [
          "very_long_tax_id_with_many_characters",
          {
            id: "very_long_tax_id_with_many_characters",
            rate: 0.05,
            isCompound: true,
          },
        ],
      ]);

      const result = buildTaxInputs(customMap, ["a", "very_long_tax_id_with_many_characters"]);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("a");
      expect(result[1]?.id).toBe("very_long_tax_id_with_many_characters");
    });
  });

  describe("Integration: toLineInput + buildTaxInputs", () => {
    it("processes line with taxes from start to finish", () => {
      const line = {
        qty: 5,
        rate: 200,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 20,
        discountIsPercentage: false,
        taxIds: ["tax_gst", "tax_pst"],
      };

      const taxMap = new Map<string, TaxInput>([
        ["tax_gst", { id: "tax_gst", rate: 0.05, isCompound: false }],
        ["tax_pst", { id: "tax_pst", rate: 0.07, isCompound: true }],
      ]);

      const lineInput = toLineInput(line);
      const lineTaxes = buildTaxInputs(taxMap, line.taxIds);

      expect(lineInput.qty).toBe(5);
      expect(lineInput.rate).toBe(200);
      expect(lineInput.discount).toBe(20);
      expect(lineTaxes).toHaveLength(2);
      expect(lineTaxes[0]?.id).toBe("tax_gst");
      expect(lineTaxes[1]?.id).toBe("tax_pst");
    });

    it("handles line with no taxes", () => {
      const line = {
        qty: 10,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const taxMap = new Map<string, TaxInput>([
        ["tax_1", { id: "tax_1", rate: 0.1, isCompound: false }],
      ]);

      const lineInput = toLineInput(line);
      const lineTaxes = buildTaxInputs(taxMap, line.taxIds);

      expect(lineInput.taxIds).toEqual([]);
      expect(lineTaxes).toEqual([]);
    });

    it("handles line with partially missing taxes", () => {
      const line = {
        qty: 3,
        rate: 300,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: ["tax_exists", "tax_missing"],
      };

      const taxMap = new Map<string, TaxInput>([
        ["tax_exists", { id: "tax_exists", rate: 0.1, isCompound: false }],
      ]);

      const lineInput = toLineInput(line);
      const lineTaxes = buildTaxInputs(taxMap, line.taxIds);

      expect(lineInput.taxIds).toHaveLength(2);
      expect(lineTaxes).toHaveLength(1); // Only the existing tax
      expect(lineTaxes[0]?.id).toBe("tax_exists");
    });
  });

  describe("Edge Cases and Data Integrity", () => {
    it("toLineInput preserves all data types correctly", () => {
      const line = {
        qty: 1.5,
        rate: 99.99,
        period: 3,
        lineType: LineType.STANDARD,
        discount: 5.5,
        discountIsPercentage: true,
        taxIds: ["t1"],
      };

      const result = toLineInput(line);

      expect(typeof result.qty).toBe("number");
      expect(typeof result.rate).toBe("number");
      expect(typeof result.period).toBe("number");
      expect(typeof result.discount).toBe("number");
      expect(typeof result.discountIsPercentage).toBe("boolean");
      expect(Array.isArray(result.taxIds)).toBe(true);
    });

    it("buildTaxInputs does not mutate input array", () => {
      const taxMap = new Map<string, TaxInput>([
        ["tax_1", { id: "tax_1", rate: 0.1, isCompound: false }],
      ]);
      const originalIds = ["tax_1"];
      const idsCopy = [...originalIds];

      buildTaxInputs(taxMap, originalIds);

      expect(originalIds).toEqual(idsCopy);
    });

    it("buildTaxInputs does not mutate tax map", () => {
      const taxMap = new Map<string, TaxInput>([
        ["tax_1", { id: "tax_1", rate: 0.1, isCompound: false }],
      ]);
      const originalSize = taxMap.size;

      buildTaxInputs(taxMap, ["tax_1", "tax_missing"]);

      expect(taxMap.size).toBe(originalSize);
    });

    it("toLineInput handles undefined period correctly", () => {
      const line = {
        qty: 1,
        rate: 100,
        period: undefined,
        lineType: LineType.STANDARD,
        discount: 0,
        discountIsPercentage: false,
        taxIds: [],
      };

      const result = toLineInput(line);

      expect(result.period).toBeUndefined();
    });

    it("buildTaxInputs with negative rates (invalid but should not crash)", () => {
      const taxMap = new Map<string, TaxInput>([
        ["tax_neg", { id: "tax_neg", rate: -0.1, isCompound: false }],
      ]);

      const result = buildTaxInputs(taxMap, ["tax_neg"]);

      expect(result).toHaveLength(1);
      expect(result[0]?.rate).toBe(-0.1);
    });

    it("buildTaxInputs with extremely small tax rate", () => {
      const taxMap = new Map<string, TaxInput>([
        ["tax_small", { id: "tax_small", rate: 0.00001, isCompound: false }],
      ]);

      const result = buildTaxInputs(taxMap, ["tax_small"]);

      expect(result[0]?.rate).toBe(0.00001);
    });
  });
});
