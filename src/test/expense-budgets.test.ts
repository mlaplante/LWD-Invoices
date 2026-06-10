import { describe, expect, it } from "vitest";
import { computeBudgetVsActual } from "@/server/services/expense-budgets";

// June 2026 has 30 days; halfway through the month the straight-line pace
// multiplier is exactly 2.
const NOW = new Date("2026-06-15T00:00:00.000Z");

const software = {
  id: "b-software",
  categoryId: "cat-software",
  categoryName: "Software",
  monthlyAmount: 1000,
};

describe("computeBudgetVsActual", () => {
  it("aggregates month-to-date actuals per category with projection", () => {
    const result = computeBudgetVsActual(
      [software],
      [
        { categoryId: "cat-software", amount: 300, date: new Date("2026-06-02T00:00:00Z") },
        { categoryId: "cat-software", amount: 100, date: new Date("2026-06-10T00:00:00Z") },
        // Prior month
        { categoryId: "cat-software", amount: 900, date: new Date("2026-05-20T00:00:00Z") },
        // Outside the two-month window — ignored
        { categoryId: "cat-software", amount: 999, date: new Date("2026-04-01T00:00:00Z") },
      ],
      NOW,
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.actual).toBe(400);
    expect(row.priorMonthActual).toBe(900);
    expect(row.percentUsed).toBe(40);
    expect(row.projected).toBe(800);
    expect(row.status).toBe("under");
    expect(result.totalActual).toBe(400);
    expect(result.unbudgetedActual).toBe(0);
  });

  it("flags warning when the run rate projects over budget, over when already over", () => {
    const result = computeBudgetVsActual(
      [
        software,
        { id: "b-travel", categoryId: "cat-travel", categoryName: "Travel", monthlyAmount: 500 },
      ],
      [
        // 600 spent halfway → projects to 1200 > 1000 budget, but not over yet.
        { categoryId: "cat-software", amount: 600, date: new Date("2026-06-05T00:00:00Z") },
        // Already past the 500 budget.
        { categoryId: "cat-travel", amount: 700, date: new Date("2026-06-05T00:00:00Z") },
      ],
      NOW,
    );

    const byCategory = Object.fromEntries(result.rows.map((r) => [r.categoryId, r]));
    expect(byCategory["cat-software"].status).toBe("warning");
    expect(byCategory["cat-travel"].status).toBe("over");
    // Most-consumed budget sorts first.
    expect(result.rows[0].categoryId).toBe("cat-travel");
  });

  it("treats a null-category budget as org-wide and tracks unbudgeted spend", () => {
    const result = computeBudgetVsActual(
      [
        { id: "b-overall", categoryId: null, categoryName: null, monthlyAmount: 3000 },
        software,
      ],
      [
        { categoryId: "cat-software", amount: 500, date: new Date("2026-06-03T00:00:00Z") },
        { categoryId: "cat-other", amount: 150, date: new Date("2026-06-03T00:00:00Z") },
        { categoryId: null, amount: 50, date: new Date("2026-06-03T00:00:00Z") },
      ],
      NOW,
    );

    expect(result.overall).not.toBeNull();
    expect(result.overall?.actual).toBe(700);
    expect(result.overall?.projected).toBe(1400);
    expect(result.overall?.status).toBe("under");
    // Org-wide budget is not a category row.
    expect(result.rows).toHaveLength(1);
    expect(result.totalActual).toBe(700);
    expect(result.unbudgetedActual).toBe(200);
  });

  it("handles empty inputs", () => {
    const result = computeBudgetVsActual([], [], NOW);
    expect(result.rows).toEqual([]);
    expect(result.overall).toBeNull();
    expect(result.totalActual).toBe(0);
    expect(result.unbudgetedActual).toBe(0);
  });
});
