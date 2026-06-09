import { describe, it, expect } from "vitest";
import { gradeCollectionsQueue } from "@/server/services/ai-eval";
import { collectionsQueueCases } from "@/server/services/ai-eval/fixtures/collections-queue.fixtures";

describe("golden: collections queue ranking", () => {
  it.each(collectionsQueueCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeCollectionsQueue(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
