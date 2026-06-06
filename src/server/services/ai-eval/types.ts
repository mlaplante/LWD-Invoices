/**
 * AI eval / regression harness — shared types.
 *
 * A golden-set harness pins the *deterministic* behavior the team owns (output
 * parsing, the reminder fact-guard, assistant answer-grounding) against a
 * versioned corpus of labeled cases, so a model/provider swap — or an
 * accidental edit to a guard — can't silently regress. Each surface defines a
 * corpus of `EvalCase`s plus a `Grader`; the runner scores them and a CI test
 * enforces aggregate thresholds (and that no `critical` safety case regresses).
 */

export interface EvalCase<Input, Expected> {
  /** Stable identifier — keep it unique within a suite; used in reports. */
  id: string;
  /** Human-readable note on what this case protects. */
  description?: string;
  input: Input;
  expected: Expected;
  /**
   * Safety-critical cases must pass exactly (score === 1). A single critical
   * failure fails the suite regardless of the aggregate score — these encode
   * "must never regress" invariants (e.g. the fact-guard catching a swapped
   * payment URL).
   */
  critical?: boolean;
}

export interface GradeOutcome {
  /** 0..1, where 1 is a perfect match. */
  score: number;
  /** Optional human-readable explanation of what missed. */
  detail?: string;
}

export type Grader<Input, Expected> = (
  input: Input,
  expected: Expected,
) => GradeOutcome;

export interface CaseResult {
  id: string;
  description?: string;
  critical: boolean;
  score: number;
  passed: boolean;
  detail?: string;
}

export interface SuiteReport {
  name: string;
  results: CaseResult[];
  /** Mean per-case score across the suite (0..1). */
  score: number;
  /** Fraction of cases that passed (0..1). */
  passRate: number;
  passed: number;
  failed: number;
  total: number;
  /** Critical cases that did not pass — any entry here fails the suite. */
  criticalFailures: CaseResult[];
}

export interface SuiteThresholds {
  /** A case "passes" when its score is at least this (default 0.999). */
  passThreshold?: number;
}
