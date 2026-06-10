/**
 * Budget-vs-actual math for the Money Intelligence hub.
 *
 * Budgets are monthly targets (per expense category, plus an optional
 * org-wide one with categoryId = null). "Actual" is month-to-date spend,
 * bucketed by each expense's effective date — paidAt when known, else
 * dueDate, else createdAt — which the router resolves before calling in.
 * Months are bucketed in UTC: budget tracking cares about "roughly this
 * month", not midnight precision in the org's zone.
 *
 * Pure function so it's unit-testable; the analytics router loads the rows.
 */

export interface BudgetForCompute {
  id: string;
  /** null = org-wide budget across all categories. */
  categoryId: string | null;
  categoryName: string | null;
  monthlyAmount: number;
}

export interface ExpenseForBudget {
  categoryId: string | null;
  amount: number;
  /** Effective date: paidAt ?? dueDate ?? createdAt. */
  date: Date;
}

export type BudgetStatus = "under" | "warning" | "over";

export interface BudgetVsActualRow {
  budgetId: string;
  categoryId: string | null;
  categoryName: string | null;
  monthlyBudget: number;
  /** Month-to-date spend. */
  actual: number;
  priorMonthActual: number;
  /** actual / budget, in percent (0 budget → 0). */
  percentUsed: number;
  /** Straight-line month-end projection from the month-to-date run rate. */
  projected: number;
  status: BudgetStatus;
}

export interface BudgetVsActualResult {
  /** Per-category budget rows, most-consumed first. */
  rows: BudgetVsActualRow[];
  /** Org-wide budget row (categoryId null), when one is set. */
  overall: BudgetVsActualRow | null;
  /** Total month-to-date spend across every expense. */
  totalActual: number;
  /** Month-to-date spend that no category budget covers. */
  unbudgetedActual: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function buildRow(
  budget: BudgetForCompute,
  actual: number,
  priorMonthActual: number,
  paceMultiplier: number,
): BudgetVsActualRow {
  const projected = round2(actual * paceMultiplier);
  const status: BudgetStatus =
    actual > budget.monthlyAmount
      ? "over"
      : projected > budget.monthlyAmount
        ? "warning"
        : "under";
  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    monthlyBudget: round2(budget.monthlyAmount),
    actual: round2(actual),
    priorMonthActual: round2(priorMonthActual),
    percentUsed:
      budget.monthlyAmount > 0 ? round2((actual / budget.monthlyAmount) * 100) : 0,
    projected,
    status,
  };
}

export function computeBudgetVsActual(
  budgets: BudgetForCompute[],
  expenses: ExpenseForBudget[],
  now: Date = new Date(),
): BudgetVsActualResult {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1);
  const nextMonthStart = Date.UTC(year, month + 1, 1);
  const priorMonthStart = Date.UTC(year, month - 1, 1);

  const daysInMonth = (nextMonthStart - monthStart) / 86_400_000;
  const dayOfMonth = now.getUTCDate();
  const paceMultiplier = daysInMonth / dayOfMonth;

  const current = new Map<string | null, number>();
  const prior = new Map<string | null, number>();
  let totalActual = 0;
  let priorTotal = 0;

  for (const e of expenses) {
    const ts = e.date.getTime();
    if (ts >= monthStart && ts < nextMonthStart) {
      current.set(e.categoryId, (current.get(e.categoryId) ?? 0) + e.amount);
      totalActual += e.amount;
    } else if (ts >= priorMonthStart && ts < monthStart) {
      prior.set(e.categoryId, (prior.get(e.categoryId) ?? 0) + e.amount);
      priorTotal += e.amount;
    }
  }

  const rows: BudgetVsActualRow[] = [];
  let overall: BudgetVsActualRow | null = null;
  let budgetedActual = 0;

  for (const budget of budgets) {
    if (budget.categoryId === null) {
      overall = buildRow(budget, totalActual, priorTotal, paceMultiplier);
      continue;
    }
    const actual = current.get(budget.categoryId) ?? 0;
    budgetedActual += actual;
    rows.push(
      buildRow(budget, actual, prior.get(budget.categoryId) ?? 0, paceMultiplier),
    );
  }

  rows.sort((a, b) => b.percentUsed - a.percentUsed);

  return {
    rows,
    overall,
    totalActual: round2(totalActual),
    unbudgetedActual: round2(totalActual - budgetedActual),
  };
}
