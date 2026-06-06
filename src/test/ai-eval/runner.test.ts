import { describe, it, expect } from "vitest";
import {
  runSuite,
  suiteMeetsGate,
  formatSuiteReport,
  checkAnswerGrounding,
  type EvalCase,
} from "@/server/services/ai-eval";

// ── The runner itself (meta-tests so the harness can't silently lie) ──────────

describe("eval runner", () => {
  type In = { n: number };
  type Exp = { n: number };
  const grade = (input: In, expected: Exp) => ({ score: input.n === expected.n ? 1 : 0 });

  const cases: EvalCase<In, Exp>[] = [
    { id: "match", input: { n: 1 }, expected: { n: 1 } },
    { id: "miss", input: { n: 1 }, expected: { n: 2 } },
    { id: "critical-miss", critical: true, input: { n: 1 }, expected: { n: 3 } },
  ];

  it("aggregates score, pass rate, and critical failures", () => {
    const report = runSuite("demo", cases, grade);
    expect(report.total).toBe(3);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(2);
    expect(report.score).toBeCloseTo(1 / 3, 5);
    expect(report.passRate).toBeCloseTo(1 / 3, 5);
    expect(report.criticalFailures.map((r) => r.id)).toEqual(["critical-miss"]);
  });

  it("treats a thrown grader as a zero-score failure, not a crash", () => {
    const report = runSuite("throws", [{ id: "boom", input: { n: 1 }, expected: { n: 1 } }], () => {
      throw new Error("kaboom");
    });
    expect(report.passed).toBe(0);
    expect(report.results[0].detail).toContain("kaboom");
  });

  it("clamps an out-of-range grader score to [0,1]", () => {
    const report = runSuite("cheat", [{ id: "c", input: { n: 1 }, expected: { n: 1 } }], () => ({ score: 5 }));
    expect(report.results[0].score).toBe(1);
  });

  it("gate vetoes on a critical failure even if averages look fine", () => {
    const report = runSuite("demo", cases, grade);
    expect(suiteMeetsGate(report, 0, 0)).toBe(false);
  });

  it("formats a readable report that hides clean cases", () => {
    const text = formatSuiteReport(runSuite("demo", cases, grade));
    expect(text).toContain("demo:");
    expect(text).toContain("CRITICAL FAILURE");
    expect(text).not.toContain("[ok  ] match");
  });
});

// ── The grounding primitive (assistant fact-guard) ────────────────────────────

describe("checkAnswerGrounding", () => {
  const data = [{ totalOutstanding: 4200, clients: [{ outstanding: 3000 }, { outstanding: 1200 }] }];

  it("accepts figures present in the tool results", () => {
    const r = checkAnswerGrounding("You're owed $4,200.00 — $3,000 and $1,200.", data);
    expect(r.grounded).toBe(true);
    expect(r.unsupportedFigures).toEqual([]);
  });

  it("allows nearest-dollar rounding of a fractional source value", () => {
    const r = checkAnswerGrounding("About $1,235 collected.", [{ collected: 1234.56 }]);
    expect(r.grounded).toBe(true);
  });

  it("flags a fabricated dollar figure", () => {
    const r = checkAnswerGrounding("You're owed $9,999.00 total.", data);
    expect(r.grounded).toBe(false);
    expect(r.unsupportedFigures).toContain(9999);
  });

  it("grounds figures that appear inside string values", () => {
    const r = checkAnswerGrounding("The balance is $1,200.", [{ label: "Outstanding: $1,200.00" }]);
    expect(r.grounded).toBe(true);
  });

  it("is vacuously grounded when the answer states no dollar amounts", () => {
    expect(checkAnswerGrounding("You have 3 overdue invoices.", data).grounded).toBe(true);
  });
});
