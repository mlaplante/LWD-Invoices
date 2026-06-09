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
import {
  reconcileBooks,
  draftAdjustingEntries,
  summarizeClose,
  type ReconcileInput,
  type CloseAnomalies,
  type ReconSeverity,
  type AdjustingEntryKind,
} from "../month-end-close";
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

// ─── Month-end close reconciliation + adjusting entries ─────────────────────────

export interface MonthEndCloseInput {
  reconcile: ReconcileInput;
  anomalies: CloseAnomalies;
}

export interface MonthEndCloseExpected {
  /** Reconciliation checks that must appear, each at the given severity. */
  expectChecks?: Array<{ check: string; severity: ReconSeverity }>;
  /** Reconciliation check ids that must NOT appear. */
  forbidChecks?: string[];
  /** Adjusting-entry kinds the agent must draft. */
  expectAdjustments?: AdjustingEntryKind[];
  /** Expected close-readiness flag. */
  canClose?: boolean;
}

/**
 * Grades the deterministic close core: that reconciliation flags the right
 * exceptions at the right severity, drafts the matching adjusting entries, and
 * computes readiness correctly. Critical cases (revenue/cash integrity) encode
 * "must never regress" invariants.
 */
export const gradeMonthEndClose: Grader<MonthEndCloseInput, MonthEndCloseExpected> = (
  input,
  expected,
) => {
  const reconciliation = reconcileBooks(input.reconcile);
  const adjustments = draftAdjustingEntries(input.reconcile, input.anomalies, reconciliation);
  const summary = summarizeClose({ reconciliation, anomalies: input.anomalies, adjustments });

  const checks: Array<{ ok: boolean; label: string }> = [];

  for (const want of expected.expectChecks ?? []) {
    const found = reconciliation.find((r) => r.check === want.check);
    const ok = !!found && found.severity === want.severity;
    checks.push({
      ok,
      label: ok
        ? ""
        : found
          ? `${want.check}: severity ${found.severity} want ${want.severity}`
          : `missing check ${want.check} (want ${want.severity})`,
    });
  }

  for (const forbid of expected.forbidChecks ?? []) {
    const ok = !reconciliation.some((r) => r.check === forbid);
    checks.push({ ok, label: ok ? "" : `unexpected check ${forbid}` });
  }

  for (const kind of expected.expectAdjustments ?? []) {
    const ok = adjustments.some((a) => a.kind === kind);
    checks.push({ ok, label: ok ? "" : `missing adjusting entry ${kind}` });
  }

  if (expected.canClose !== undefined) {
    const ok = summary.canClose === expected.canClose;
    checks.push({ ok, label: ok ? "" : `canClose ${summary.canClose} want ${expected.canClose}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return {
    score: total === 0 ? 1 : correct / total,
    detail: misses.length > 0 ? misses.join("; ") : undefined,
  };
};

function fmt(value: unknown): string {
  return value === null ? "null" : typeof value === "string" ? `"${value}"` : String(value);
}

// ─── Proposal generator (section-key conformance + grounding guard) ────────────

import {
  groundSuggestedItems,
  conformSectionKeys,
  type OrgItem,
  type SuggestedLineItem,
  type ProposalSection,
} from "../proposal-generator";

export interface ProposalGeneratorInput {
  /** Raw model sections, graded through conformSectionKeys. */
  modelSections: ProposalSection[];
  templateSections: ProposalSection[];
  /** Raw model line-item suggestions, graded through the grounding guard. */
  modelItems: SuggestedLineItem[];
  items: OrgItem[];
}

export interface ProposalGeneratorExpected {
  /** Section keys the conformed output must have, in this exact order. */
  expectSectionKeys: string[];
  /** itemIds that must survive grounding (real ones); fabricated ones must be gone. */
  expectGroundedItemIds: string[];
}

export const gradeProposalGenerator: Grader<ProposalGeneratorInput, ProposalGeneratorExpected> = (
  input,
  expected,
) => {
  const sections = conformSectionKeys(input.modelSections, input.templateSections);
  const grounded = groundSuggestedItems(input.modelItems, input.items);
  const checks: Array<{ ok: boolean; label: string }> = [];

  const gotKeys = sections.map((s) => s.key);
  const keysOk =
    gotKeys.length === expected.expectSectionKeys.length &&
    gotKeys.every((k, i) => k === expected.expectSectionKeys[i]);
  checks.push({
    ok: keysOk,
    label: keysOk ? "" : `keys got [${gotKeys.join(",")}] want [${expected.expectSectionKeys.join(",")}]`,
  });

  const gotIds = grounded.map((g) => g.itemId);
  const idsOk =
    gotIds.length === expected.expectGroundedItemIds.length &&
    expected.expectGroundedItemIds.every((id) => gotIds.includes(id));
  checks.push({
    ok: idsOk,
    label: idsOk ? "" : `grounded ids got [${gotIds.join(",")}] want [${expected.expectGroundedItemIds.join(",")}]`,
  });

  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: correct / checks.length, detail: misses.length ? misses.join("; ") : undefined };
};

// ─── Collections queue ranking determinism ─────────────────────────────────────

import { rankCollectionsQueue, type CollectionRiskScore } from "../collection-risk";

export interface CollectionsQueueInput {
  scores: CollectionRiskScore[];
}

export interface CollectionsQueueExpected {
  /** The invoiceIds in the exact order the queue must produce. */
  order: string[];
}

export const gradeCollectionsQueue: Grader<CollectionsQueueInput, CollectionsQueueExpected> = (
  input,
  expected,
) => {
  const got = rankCollectionsQueue(input.scores).map((s) => s.invoiceId);
  const ok = got.length === expected.order.length && got.every((id, i) => id === expected.order[i]);
  return ok
    ? { score: 1 }
    : { score: 0, detail: `order got [${got.join(",")}] want [${expected.order.join(",")}]` };
};

// ─── Expense categorization (history majority-vote + AI grounding guard) ───────

import {
  suggestFromHistory,
  groundAiCategory,
  type PastExpense,
  type OrgCategory,
} from "../expense-categorization";

export interface ExpenseCategorizationInput {
  supplierId: string | null;
  history: PastExpense[];
  /** Optional AI-returned id, graded through the grounding guard. */
  aiCategoryId?: string | null;
  categories?: OrgCategory[];
}

export interface ExpenseCategorizationExpected {
  /** Expected deterministic category from history, or null to expect no history match. */
  historyCategoryId?: string | null;
  /** After grounding, the AI id must resolve to this (null = dropped). */
  groundedAiCategoryId?: string | null;
}

export const gradeExpenseCategorization: Grader<
  ExpenseCategorizationInput,
  ExpenseCategorizationExpected
> = (input, expected) => {
  const checks: Array<{ ok: boolean; label: string }> = [];

  if (expected.historyCategoryId !== undefined) {
    const got = suggestFromHistory(input.supplierId, input.history)?.categoryId ?? null;
    const ok = got === expected.historyCategoryId;
    checks.push({ ok, label: ok ? "" : `history category got ${got} want ${expected.historyCategoryId}` });
  }

  if (expected.groundedAiCategoryId !== undefined) {
    const got = groundAiCategory(input.aiCategoryId ?? null, input.categories ?? []);
    const ok = got === expected.groundedAiCategoryId;
    checks.push({ ok, label: ok ? "" : `grounded ai got ${got} want ${expected.groundedAiCategoryId}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: total === 0 ? 1 : correct / total, detail: misses.length ? misses.join("; ") : undefined };
};

// ─── Invoice review (deterministic checks + grounding guard) ──────────────────

import {
  runDeterministicChecks,
  guardUnclearDescriptionFlags,
  type InvoiceReviewSnapshot,
  type UnclearDescriptionFlag,
} from "../invoice-review";

export interface InvoiceReviewInput {
  snapshot: InvoiceReviewSnapshot;
  /** Raw flags a model "returned" — graded through the grounding guard. */
  modelFlags?: UnclearDescriptionFlag[];
}

export interface InvoiceReviewExpected {
  /** Deterministic finding codes that must appear. */
  expectCodes?: string[];
  /** Finding codes that must NOT appear. */
  forbidCodes?: string[];
  /** After grounding, unclear-description flags must point only at these lineIds. */
  expectGroundedLineIds?: string[];
}

export const gradeInvoiceReview: Grader<InvoiceReviewInput, InvoiceReviewExpected> = (
  input,
  expected,
) => {
  const codes = runDeterministicChecks(input.snapshot).map((f) => f.code);
  const grounded = guardUnclearDescriptionFlags(input.snapshot, input.modelFlags ?? []);
  const groundedIds = grounded.map((f) => f.fields[0]!.replace("line:", ""));

  const checks: Array<{ ok: boolean; label: string }> = [];
  for (const code of expected.expectCodes ?? []) {
    const ok = codes.includes(code);
    checks.push({ ok, label: ok ? "" : `missing finding ${code}` });
  }
  for (const code of expected.forbidCodes ?? []) {
    const ok = !codes.includes(code);
    checks.push({ ok, label: ok ? "" : `unexpected finding ${code}` });
  }
  if (expected.expectGroundedLineIds) {
    const ok =
      groundedIds.length === expected.expectGroundedLineIds.length &&
      expected.expectGroundedLineIds.every((id) => groundedIds.includes(id));
    checks.push({ ok, label: ok ? "" : `grounded ids ${groundedIds.join(",")} want ${expected.expectGroundedLineIds.join(",")}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: total === 0 ? 1 : correct / total, detail: misses.length ? misses.join("; ") : undefined };
};
