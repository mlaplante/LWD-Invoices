import { describe, it, expect } from "vitest";
import { nextFocusOnEnter, duplicateRowAt, type RowRef } from "@/components/invoices/line-item-keyboard";

describe("line-item-keyboard", () => {
  it("nextFocusOnEnter on the last row signals a new row append", () => {
    expect(nextFocusOnEnter({ rowCount: 3, rowIndex: 2 })).toEqual({ action: "append", focusRow: 3 });
  });
  it("nextFocusOnEnter on a middle row moves focus to the next row", () => {
    expect(nextFocusOnEnter({ rowCount: 3, rowIndex: 0 })).toEqual({ action: "focus", focusRow: 1 });
  });
  it("duplicateRowAt clones the row and inserts it after the source", () => {
    const rows: RowRef[] = [{ description: "A", qty: 1, rate: 10 }, { description: "B", qty: 2, rate: 20 }];
    expect(duplicateRowAt(rows, 0)).toEqual([
      { description: "A", qty: 1, rate: 10 },
      { description: "A", qty: 1, rate: 10 },
      { description: "B", qty: 2, rate: 20 },
    ]);
  });
});
