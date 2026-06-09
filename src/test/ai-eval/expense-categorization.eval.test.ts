import { describe, it, expect } from "vitest";
import { gradeExpenseCategorization } from "@/server/services/ai-eval";
import { expenseCategorizationCases } from "@/server/services/ai-eval/fixtures/expense-categorization.fixtures";

describe("golden: expense categorization", () => {
  it.each(expenseCategorizationCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeExpenseCategorization(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
