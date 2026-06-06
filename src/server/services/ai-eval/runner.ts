/**
 * AI eval harness — suite runner and report formatting.
 *
 * Pure and synchronous: a grader maps (input, expected) → a 0..1 score, the
 * runner aggregates per-case scores into a `SuiteReport`. No model calls happen
 * here — graders run the deterministic guard/parse code under test against a
 * golden corpus. The same runner backs both the Vitest CI gate and the
 * `scripts/ai-eval.ts` report.
 */

import type {
  CaseResult,
  EvalCase,
  Grader,
  SuiteReport,
  SuiteThresholds,
} from "./types";

const DEFAULT_PASS_THRESHOLD = 0.999;

export function runSuite<Input, Expected>(
  name: string,
  cases: ReadonlyArray<EvalCase<Input, Expected>>,
  grader: Grader<Input, Expected>,
  thresholds: SuiteThresholds = {},
): SuiteReport {
  const passThreshold = thresholds.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  const results: CaseResult[] = cases.map((testCase) => {
    let score: number;
    let detail: string | undefined;
    try {
      const outcome = grader(testCase.input, testCase.expected);
      // Clamp so a buggy grader can't manufacture a passing score > 1.
      score = Math.max(0, Math.min(1, outcome.score));
      detail = outcome.detail;
    } catch (err) {
      score = 0;
      detail = `grader threw: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      id: testCase.id,
      description: testCase.description,
      critical: testCase.critical ?? false,
      score,
      passed: score >= passThreshold,
      detail,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const meanScore = total === 0 ? 1 : results.reduce((s, r) => s + r.score, 0) / total;

  return {
    name,
    results,
    score: meanScore,
    passRate: total === 0 ? 1 : passed / total,
    passed,
    failed: total - passed,
    total,
    criticalFailures: results.filter((r) => r.critical && !r.passed),
  };
}

/** Format a single suite as an aligned, human-scannable text block. */
export function formatSuiteReport(report: SuiteReport): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  lines.push(
    `${report.name}: score ${pct(report.score)} · pass ${report.passed}/${report.total} (${pct(report.passRate)})` +
      (report.criticalFailures.length > 0 ? ` · ${report.criticalFailures.length} CRITICAL FAILURE(S)` : ""),
  );
  for (const r of report.results) {
    if (r.passed && !r.detail) continue;
    const mark = r.passed ? "ok  " : r.critical ? "CRIT" : "FAIL";
    lines.push(`  [${mark}] ${r.id} (${pct(r.score)})${r.detail ? ` — ${r.detail}` : ""}`);
  }
  return lines.join("\n");
}

export function formatReports(reports: SuiteReport[]): string {
  return reports.map(formatSuiteReport).join("\n\n");
}

/** True when every suite cleared its gate (see {@link suiteMeetsGate}). */
export function allSuitesPassed(
  reports: SuiteReport[],
  minScore: number,
  minPassRate: number,
): boolean {
  return reports.every((r) => suiteMeetsGate(r, minScore, minPassRate));
}

/**
 * A suite clears its gate when it has no critical failures AND meets both the
 * mean-score and pass-rate floors. Critical failures are an absolute veto.
 */
export function suiteMeetsGate(
  report: SuiteReport,
  minScore: number,
  minPassRate: number,
): boolean {
  return (
    report.criticalFailures.length === 0 &&
    report.score >= minScore &&
    report.passRate >= minPassRate
  );
}
