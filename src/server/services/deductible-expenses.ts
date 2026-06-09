import type { PrismaClient } from "@/generated/prisma";

export const UNCATEGORIZED_LABEL = "Uncategorized — review";

export type ExpenseForDeduction = {
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  deductible: boolean | null; // null when uncategorized
};

export type DeductibleCategoryRow = {
  category: string;
  amount: number;
  deductible: boolean;
};

export type DeductibleResult = {
  deductibleTotal: number;
  nonDeductibleTotal: number;
  uncategorizedTotal: number;
  byCategory: DeductibleCategoryRow[];
};

/**
 * Aggregate expenses for the tax dashboard. Uncategorized expenses (no
 * category) cannot be assumed deductible, so they go to their own bucket and
 * are EXCLUDED from `deductibleTotal` — surfacing the data-hygiene gap.
 */
export function aggregateDeductibleExpenses(
  expenses: ExpenseForDeduction[],
): DeductibleResult {
  const byKey = new Map<string, DeductibleCategoryRow>();
  let deductibleTotal = 0;
  let nonDeductibleTotal = 0;
  let uncategorizedTotal = 0;

  for (const e of expenses) {
    const isUncategorized = e.categoryId === null;
    const category = isUncategorized ? UNCATEGORIZED_LABEL : e.categoryName ?? UNCATEGORIZED_LABEL;
    const deductible = isUncategorized ? false : e.deductible === true;

    if (isUncategorized) uncategorizedTotal += e.amount;
    else if (deductible) deductibleTotal += e.amount;
    else nonDeductibleTotal += e.amount;

    const existing = byKey.get(category);
    if (existing) existing.amount += e.amount;
    else byKey.set(category, { category, amount: e.amount, deductible });
  }

  const byCategory = Array.from(byKey.values()).sort((a, b) => b.amount - a.amount);
  return { deductibleTotal, nonDeductibleTotal, uncategorizedTotal, byCategory };
}

type DateRange = { from?: Date; to?: Date };

export async function getDeductibleExpenses(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<DeductibleResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const expenses = await db.expense.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      rate: true,
      qty: true,
      categoryId: true,
      category: { select: { name: true, deductible: true } },
    },
  });

  return aggregateDeductibleExpenses(
    expenses.map((e) => ({
      amount: Number(e.rate) * e.qty,
      categoryId: e.categoryId,
      categoryName: e.category?.name ?? null,
      deductible: e.category?.deductible ?? null,
    })),
  );
}
