/**
 * AI eval / regression harness — public entry point.
 *
 * Registers the golden suites with their CI gates and exposes a single
 * `runAllEvalSuites()` used by both the Vitest gate (`src/test/ai-eval/`) and
 * the `scripts/ai-eval.ts` report. Tightening a gate here raises the bar a
 * model/provider swap must clear before it can ship.
 */

import { runSuite, suiteMeetsGate } from "./runner";
import { gradeGrounding, gradeMonthEndClose, gradeOcr, gradeReminderGuard } from "./graders";
import { ocrCases } from "./fixtures/ocr.fixtures";
import { reminderGuardCases } from "./fixtures/reminder-guard.fixtures";
import { groundingCases } from "./fixtures/assistant-grounding.fixtures";
import { monthEndCloseCases } from "./fixtures/month-end-close.fixtures";
import type { SuiteReport } from "./types";

export interface SuiteGate {
  /** Minimum acceptable mean per-case score (0..1). */
  minScore: number;
  /** Minimum acceptable fraction of cases passing (0..1). */
  minPassRate: number;
}

export interface EvalSuiteResult {
  report: SuiteReport;
  gate: SuiteGate;
  passedGate: boolean;
}

/**
 * Per-suite gates. The safety guards (reminder fact-guard, assistant grounding)
 * demand a perfect pass rate — every labeled case must hold, and any `critical`
 * miss is an absolute veto. OCR parsing allows a hair of slack on the aggregate
 * score for non-critical formatting edge cases while still requiring all cases
 * to pass at the default threshold.
 */
export function runAllEvalSuites(): EvalSuiteResult[] {
  const suites: Array<{ report: SuiteReport; gate: SuiteGate }> = [
    {
      report: runSuite("receipt-ocr-parsing", ocrCases, gradeOcr),
      gate: { minScore: 0.95, minPassRate: 1 },
    },
    {
      report: runSuite("reminder-fact-guard", reminderGuardCases, gradeReminderGuard),
      gate: { minScore: 1, minPassRate: 1 },
    },
    {
      report: runSuite("assistant-answer-grounding", groundingCases, gradeGrounding),
      gate: { minScore: 1, minPassRate: 1 },
    },
    {
      // The close agent's reconciliation/adjustment core is deterministic and
      // safety-critical (revenue + cash integrity), so it must pass perfectly.
      report: runSuite("month-end-close", monthEndCloseCases, gradeMonthEndClose),
      gate: { minScore: 1, minPassRate: 1 },
    },
  ];

  return suites.map(({ report, gate }) => ({
    report,
    gate,
    passedGate: suiteMeetsGate(report, gate.minScore, gate.minPassRate),
  }));
}

export * from "./types";
export * from "./runner";
export * from "./grounding";
export {
  gradeOcr,
  gradeReminderGuard,
  gradeGrounding,
  gradeMonthEndClose,
  type OcrEvalInput,
  type OcrEvalExpected,
  type ReminderGuardInput,
  type ReminderGuardExpected,
  type GroundingInput,
  type GroundingExpected,
  type MonthEndCloseInput,
  type MonthEndCloseExpected,
} from "./graders";
