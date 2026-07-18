import { describe, expect, it } from "vitest";
import { finalizeTriage } from "@/server/services/reply-triage";

describe("finalizeTriage", () => {
  it("passes through a high-confidence classification", () => expect(finalizeTriage({ category: "DISPUTE", confidence: 0.9, reasoning: "Charge challenged" })).toMatchObject({ category: "DISPUTE", source: "ai" }));
  it("falls back for low confidence and malformed output", () => {
    expect(finalizeTriage({ category: "QUESTION", confidence: 0.4, reasoning: "Maybe" })).toMatchObject({ category: "NEEDS_REVIEW", source: "fallback_low_confidence" });
    expect(finalizeTriage("nope")).toMatchObject({ category: "NEEDS_REVIEW", source: "fallback_invalid_output" });
  });
  it("only preserves valid promise dates", () => {
    expect(finalizeTriage({ category: "QUESTION", confidence: 1, reasoning: "Question", promisedDate: "2026-07-20" }).promisedDate).toBeNull();
    expect(finalizeTriage({ category: "PROMISE_TO_PAY", confidence: 1, reasoning: "Pay", promisedDate: "invalid" }).promisedDate).toBeNull();
  });
});
