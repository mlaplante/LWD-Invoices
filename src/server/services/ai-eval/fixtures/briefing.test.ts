/**
 * Tests for the Weekly Business Briefing AI eval harness.
 *
 * Verifies that briefing recommendations are grounded in supplied aggregate
 * facts, do not hallucinate unsupported financial figures, handle empty/low-data
 * scenarios safely, and avoid exposing cross-tenant or excessive raw financial
 * data.
 */

import { describe, it, expect } from "vitest";
import { gradeBriefing } from "@/server/services/ai-eval";
import { briefingCases } from "@/server/services/ai-eval/fixtures/briefing.fixtures";

describe("golden: weekly briefing grounding", () => {
  it.each(briefingCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeBriefing(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});