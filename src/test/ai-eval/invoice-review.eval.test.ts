import { describe, it, expect } from "vitest";
import { gradeInvoiceReview } from "@/server/services/ai-eval";
import { invoiceReviewCases } from "@/server/services/ai-eval/fixtures/invoice-review.fixtures";

describe("golden: invoice review checks", () => {
  it.each(invoiceReviewCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeInvoiceReview(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
