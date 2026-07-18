import type { EvalCase } from "../types";
import type { TriageOutput } from "../../reply-triage";
type Input = { raw: unknown }; type Expected = { category: TriageOutput["category"]; source: string; promisedDate?: boolean };
const ai = (category: TriageOutput["category"], confidence = .9, promisedDate?: string): Input => ({ raw: { category, confidence, reasoning: "Model classification", promisedDate } });
export const replyTriageCases: ReadonlyArray<EvalCase<Input, Expected>> = [
  { id: "promise-date", description: "Promise", critical: true, input: ai("PROMISE_TO_PAY", .9, "2026-08-01"), expected: { category: "PROMISE_TO_PAY", source: "ai", promisedDate: true } },
  { id: "dispute", description: "Dispute", critical: true, input: ai("DISPUTE"), expected: { category: "DISPUTE", source: "ai" } },
  { id: "polite-dispute", description: "Dispute", critical: true, input: ai("DISPUTE"), expected: { category: "DISPUTE", source: "ai" } },
  { id: "question", description: "Question", input: ai("QUESTION"), expected: { category: "QUESTION", source: "ai" } },
  { id: "info", description: "Info", input: ai("INFO_UPDATE"), expected: { category: "INFO_UPDATE", source: "ai" } },
  { id: "ooo", description: "Low confidence", input: ai("QUESTION", .55), expected: { category: "NEEDS_REVIEW", source: "fallback_low_confidence" } },
  { id: "low", description: "Low", critical: true, input: ai("PROMISE_TO_PAY", .55), expected: { category: "NEEDS_REVIEW", source: "fallback_low_confidence" } },
  { id: "malformed", description: "Malformed", critical: true, input: { raw: "{" }, expected: { category: "NEEDS_REVIEW", source: "fallback_invalid_output" } },
  { id: "question-date", description: "Date stripped", input: ai("QUESTION", .9, "2026-08-01"), expected: { category: "QUESTION", source: "ai", promisedDate: false } },
  { id: "promise", description: "Promise", input: ai("PROMISE_TO_PAY"), expected: { category: "PROMISE_TO_PAY", source: "ai" } },
  { id: "review", description: "Review", input: ai("NEEDS_REVIEW"), expected: { category: "NEEDS_REVIEW", source: "ai" } },
  { id: "invalid-date", description: "Invalid", input: ai("PROMISE_TO_PAY", .9, "never"), expected: { category: "PROMISE_TO_PAY", source: "ai", promisedDate: false } },
];
