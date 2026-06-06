import { describe, it, expect } from "vitest";
import {
  detectExpenseAnomalies,
  type AnomalyExpense,
} from "@/server/services/expense-anomaly";

function expense(overrides: Partial<AnomalyExpense> = {}): AnomalyExpense {
  return {
    id: Math.random().toString(36).slice(2),
    supplierKey: "aws",
    supplierName: "AWS",
    amount: 100,
    date: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

describe("detectExpenseAnomalies — duplicates", () => {
  it("flags same-supplier same-amount same-day expenses as a danger duplicate", () => {
    const report = detectExpenseAnomalies([
      expense({ id: "a", amount: 250, date: new Date("2026-06-01T09:00:00Z") }),
      expense({ id: "b", amount: 250, date: new Date("2026-06-01T17:00:00Z") }),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].severity).toBe("danger");
    expect(report.duplicates[0].expenseIds.sort()).toEqual(["a", "b"]);
    expect(report.summary.duplicateExposure).toBe(250);
  });

  it("flags within-window duplicates as a warning", () => {
    const report = detectExpenseAnomalies(
      [
        expense({ id: "a", amount: 250, date: new Date("2026-06-01T00:00:00Z") }),
        expense({ id: "b", amount: 250, date: new Date("2026-06-04T00:00:00Z") }),
      ],
      { duplicateWindowDays: 7 },
    );
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].severity).toBe("warning");
  });

  it("does not flag duplicates outside the window", () => {
    const report = detectExpenseAnomalies(
      [
        expense({ id: "a", amount: 250, date: new Date("2026-06-01T00:00:00Z") }),
        expense({ id: "b", amount: 250, date: new Date("2026-06-20T00:00:00Z") }),
      ],
      { duplicateWindowDays: 7 },
    );
    expect(report.duplicates).toHaveLength(0);
  });

  it("does not flag same-amount expenses from different suppliers", () => {
    const report = detectExpenseAnomalies([
      expense({ id: "a", amount: 250, supplierKey: "aws", supplierName: "AWS" }),
      expense({ id: "b", amount: 250, supplierKey: "gcp", supplierName: "GCP" }),
    ]);
    expect(report.duplicates).toHaveLength(0);
  });

  it("accumulates exposure across redundant copies", () => {
    const report = detectExpenseAnomalies([
      expense({ id: "a", amount: 100, date: new Date("2026-06-01T00:00:00Z") }),
      expense({ id: "b", amount: 100, date: new Date("2026-06-01T01:00:00Z") }),
      expense({ id: "c", amount: 100, date: new Date("2026-06-01T02:00:00Z") }),
    ]);
    expect(report.duplicates[0].expenseIds).toHaveLength(3);
    // Two redundant copies beyond the first.
    expect(report.summary.duplicateExposure).toBe(200);
  });
});

describe("detectExpenseAnomalies — outliers", () => {
  it("flags an expense far above the supplier's typical spend", () => {
    const history: AnomalyExpense[] = [
      expense({ id: "1", amount: 100, date: new Date("2026-01-01") }),
      expense({ id: "2", amount: 110, date: new Date("2026-02-01") }),
      expense({ id: "3", amount: 95, date: new Date("2026-03-01") }),
      expense({ id: "4", amount: 105, date: new Date("2026-04-01") }),
      expense({ id: "big", amount: 900, date: new Date("2026-05-01") }),
    ];
    const report = detectExpenseAnomalies(history);
    expect(report.outliers).toHaveLength(1);
    expect(report.outliers[0].expenseId).toBe("big");
    expect(report.outliers[0].severity).toBe("danger");
    expect(report.outliers[0].multiple).toBeGreaterThanOrEqual(6);
  });

  it("does not flag outliers without enough supplier history", () => {
    const report = detectExpenseAnomalies([
      expense({ id: "1", amount: 100 }),
      expense({ id: "big", amount: 5000 }),
    ]);
    expect(report.outliers).toHaveLength(0);
  });

  it("does not flag a high-variance supplier where large amounts are normal", () => {
    const history: AnomalyExpense[] = [
      expense({ id: "1", amount: 100 }),
      expense({ id: "2", amount: 800 }),
      expense({ id: "3", amount: 200 }),
      expense({ id: "4", amount: 900 }),
      expense({ id: "5", amount: 500 }),
    ];
    const report = detectExpenseAnomalies(history);
    expect(report.outliers).toHaveLength(0);
  });
});
