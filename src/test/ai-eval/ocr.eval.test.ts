import { describe, it, expect } from "vitest";
import { gradeOcr } from "@/server/services/ai-eval";
import { ocrCases } from "@/server/services/ai-eval/fixtures/ocr.fixtures";

describe("golden: receipt-OCR output parsing", () => {
  it.each(ocrCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeOcr(testCase.input, testCase.expected);
    // Every OCR golden case must parse perfectly — partial extraction is the bug.
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
