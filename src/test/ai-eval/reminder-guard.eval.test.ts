import { describe, it, expect } from "vitest";
import { gradeReminderGuard } from "@/server/services/ai-eval";
import { reminderGuardCases } from "@/server/services/ai-eval/fixtures/reminder-guard.fixtures";

describe("golden: reminder fact-guard", () => {
  it.each(reminderGuardCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeReminderGuard(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
