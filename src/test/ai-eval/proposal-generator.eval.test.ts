import { describe, it, expect } from "vitest";
import { gradeProposalGenerator } from "@/server/services/ai-eval";
import { proposalGeneratorCases } from "@/server/services/ai-eval/fixtures/proposal-generator.fixtures";

describe("golden: proposal generator", () => {
  it.each(proposalGeneratorCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeProposalGenerator(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
