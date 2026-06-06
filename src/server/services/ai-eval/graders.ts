/**
 * Graders for the three AI surfaces. Each grader runs the real deterministic
 * code under test (no model calls) against a golden case and returns a 0..1
 * score with a human-readable detail string for misses.
 */

import { normalizeOCRPayload, type OCRResult } from "../receipt-ocr";
import {
  containsHallucinatedInvoiceFacts,
  type ReminderInvoiceFacts,
} from "../smart-reminder-drafts";
import { checkAnswerGrounding } from "./grounding";
import type { Grader } from "./types";

// ─── OCR extraction ────────────────────────────────────────────────────────────

export interface OcrEvalInput {
  /** Raw text the model returned — exactly what `normalizeOCRPayload` parses. */
  raw: string;
}

/** Expected values for the fields we grade; omit a field to skip grading it. */
export type OcrEvalExpected = Partial<
  Pick<OCRResult, "vendor" | "amount" | "tax" | "currency" | "date" | "category">
> & {
  /** Expected number of line items, when the case pins it. */
  lineItemCount?: number;
  /** Minimum acceptable confidence (e.g. a clear receipt should report >= 0.8). */
  minConfidence?: number;
};

const OCR_FIELDS: Array<keyof OcrEvalExpected> = [
  "vendor",
  "amount",
  "tax",
  "currency",
  "date",
  "category",
];

export const gradeOcr: Grader<OcrEvalInput, OcrEvalExpected> = (input, expected) => {
  const result = normalizeOCRPayload(input.raw);
  const checks: Array<{ ok: boolean; label: string }> = [];

  for (const field of OCR_FIELDS) {
    if (expected[field] === undefined) continue;
    const got = result[field as keyof OCRResult];
    const want = expected[field];
    const ok = got === want;
    checks.push({ ok, label: ok ? "" : `${field}: got ${fmt(got)} want ${fmt(want)}` });
  }

  if (expected.lineItemCount !== undefined) {
    const ok = result.lineItems.length === expected.lineItemCount;
    checks.push({ ok, label: ok ? "" : `lineItems: got ${result.lineItems.length} want ${expected.lineItemCount}` });
  }

  if (expected.minConfidence !== undefined) {
    const ok = result.confidence >= expected.minConfidence;
    checks.push({ ok, label: ok ? "" : `confidence ${result.confidence} < ${expected.minConfidence}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);

  return {
    score: total === 0 ? 1 : correct / total,
    detail: misses.length > 0 ? misses.join("; ") : undefined,
  };
};

// ─── Reminder fact-guard ───────────────────────────────────────────────────────

export interface ReminderGuardInput {
  draft: { subject: string; body: string };
  invoice: ReminderInvoiceFacts;
}

export interface ReminderGuardExpected {
  /** True when the guard SHOULD reject this draft as containing wrong facts. */
  shouldFlag: boolean;
}

export const gradeReminderGuard: Grader<ReminderGuardInput, ReminderGuardExpected> = (
  input,
  expected,
) => {
  const flagged = containsHallucinatedInvoiceFacts(
    `${input.draft.subject}\n${input.draft.body}`,
    input.invoice,
  );
  if (flagged === expected.shouldFlag) return { score: 1 };
  return {
    score: 0,
    detail: expected.shouldFlag
      ? "MISSED a hallucinated fact (false negative — unsafe draft would send)"
      : "flagged a SAFE draft (false positive — would needlessly downgrade to template)",
  };
};

// ─── Assistant answer grounding ─────────────────────────────────────────────────

export interface GroundingInput {
  answer: string;
  toolResults: unknown[];
}

export interface GroundingExpected {
  /** True when every dollar figure in the answer is supported by the data. */
  grounded: boolean;
}

export const gradeGrounding: Grader<GroundingInput, GroundingExpected> = (input, expected) => {
  const result = checkAnswerGrounding(input.answer, input.toolResults);
  if (result.grounded === expected.grounded) return { score: 1 };
  return {
    score: 0,
    detail: expected.grounded
      ? `flagged a grounded answer (false positive); figures: ${result.statedFigures.join(", ")}`
      : `missed fabricated figure(s): ${result.unsupportedFigures.join(", ")} (false negative — unsafe)`,
  };
};

function fmt(value: unknown): string {
  return value === null ? "null" : typeof value === "string" ? `"${value}"` : String(value);
}
