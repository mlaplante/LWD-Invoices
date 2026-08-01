import { describe, it, expect } from "vitest";
import { newLine, computeLineResult } from "@/components/invoices/line-item-utils";
import { LineType } from "@/generated/prisma";

describe("line-item-utils", () => {
  it("newLine produces a standard empty row with the given sort", () => {
    expect(newLine(7)).toMatchObject({
      sort: 7,
      lineType: LineType.STANDARD,
      name: "",
      qty: 1,
      rate: 0,
      taxIds: [],
    });
  });

  it("computeLineResult applies only the line's selected taxes", () => {
    const line = { ...newLine(0), qty: 2, rate: 100, taxIds: ["t1"] };
    const taxes = [
      { id: "t1", name: "GST", rate: 10, isCompound: false },
      { id: "t2", name: "PST", rate: 50, isCompound: false },
    ];
    const result = computeLineResult(line, taxes);
    expect(result.subtotal).toBe(200);
    expect(result.taxTotal).toBe(20); // only t1, not t2
    expect(result.total).toBe(220);
  });
});
