import { describe, it, expect } from "vitest";
import { gradeGrounding } from "@/server/services/ai-eval";
import { groundingCases } from "@/server/services/ai-eval/fixtures/assistant-grounding.fixtures";

describe("golden: assistant answer grounding", () => {
  it.each(groundingCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeGrounding(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
