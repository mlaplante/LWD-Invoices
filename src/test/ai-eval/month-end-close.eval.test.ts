import { describe, it, expect } from "vitest";
import { gradeMonthEndClose } from "@/server/services/ai-eval";
import { monthEndCloseCases } from "@/server/services/ai-eval/fixtures/month-end-close.fixtures";

describe("golden: month-end close reconciliation + adjusting entries", () => {
  it.each(monthEndCloseCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeMonthEndClose(testCase.input, testCase.expected);
    // Every close golden case must hold exactly — the reconciliation core is the
    // safety floor for the one-click close.
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
