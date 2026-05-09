import type { Prisma } from "@/generated/prisma";

/**
 * Standard expense include used by list, get, create, update flows.
 * Centralized so list shape stays consistent across the four routers
 * that read expenses.
 */
export const detailExpenseInclude = {
  tax: true,
  category: true,
  supplier: true,
  project: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;
