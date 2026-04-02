import { describe, it, expect } from "vitest";
import { formatCreditNoteNumber } from "@/server/services/credit-note-numbering";

describe("formatCreditNoteNumber", () => {
  it("pads single-digit numbers to 4 digits", () => {
    expect(formatCreditNoteNumber("CN", 1)).toBe("CN-0001");
  });

  it("pads double-digit numbers", () => {
    expect(formatCreditNoteNumber("CN", 42)).toBe("CN-0042");
  });

  it("uses custom prefix", () => {
    expect(formatCreditNoteNumber("CREDIT", 7)).toBe("CREDIT-0007");
  });

  it("does not truncate numbers larger than 4 digits", () => {
    expect(formatCreditNoteNumber("CN", 12345)).toBe("CN-12345");
  });
});
