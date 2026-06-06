import { describe, it, expect } from "vitest";
import { runAllEvalSuites, formatReports } from "@/server/services/ai-eval";

/**
 * The CI gate for the AI golden suites. Each suite must clear its configured
 * gate (mean score + pass rate) with zero critical failures. This is the test a
 * model/provider swap — or an accidental edit to a guard or parser — has to keep
 * green. Run just this surface with `npm run test:eval`.
 *
 * The full report is printed on every run so a regression shows exactly which
 * case and which field moved.
 */
describe("AI eval golden suites", () => {
  const results = runAllEvalSuites();

  // Print the report once so the harness doubles as a readable scorecard.
  console.log("\n" + formatReports(results.map((r) => r.report)) + "\n");

  for (const { report, gate, passedGate } of results) {
    describe(report.name, () => {
      it(`has no critical failures`, () => {
        expect(report.criticalFailures, formatFailures(report.criticalFailures)).toHaveLength(0);
      });

      it(`meets its score gate (>= ${gate.minScore})`, () => {
        expect(report.score).toBeGreaterThanOrEqual(gate.minScore);
      });

      it(`meets its pass-rate gate (>= ${gate.minPassRate})`, () => {
        expect(report.passRate).toBeGreaterThanOrEqual(gate.minPassRate);
      });

      it("clears the overall gate", () => {
        expect(passedGate).toBe(true);
      });
    });
  }
});

function formatFailures(failures: Array<{ id: string; detail?: string }>): string {
  return failures.length === 0
    ? "no critical failures"
    : "critical failures: " + failures.map((f) => `${f.id} (${f.detail ?? "no detail"})`).join("; ");
}
