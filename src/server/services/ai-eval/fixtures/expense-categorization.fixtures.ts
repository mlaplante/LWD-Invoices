import type { EvalCase } from "../types";
import type { ExpenseCategorizationInput, ExpenseCategorizationExpected } from "../graders";
import type { PastExpense } from "../../expense-categorization";

const history: PastExpense[] = [
  { supplierId: "aws", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: null },
  { supplierId: "aws", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: null },
  { supplierId: "aws", categoryId: "cat-hosting", taxId: "t1", reimbursable: false, projectId: null },
];

export const expenseCategorizationCases: EvalCase<
  ExpenseCategorizationInput,
  ExpenseCategorizationExpected
>[] = [
  {
    id: "history-majority",
    description: "majority category wins for a known supplier",
    input: { supplierId: "aws", history },
    expected: { historyCategoryId: "cat-software" },
  },
  {
    id: "no-history",
    description: "unknown supplier yields no deterministic match",
    input: { supplierId: "stripe", history },
    expected: { historyCategoryId: null },
  },
  {
    id: "grounding-drops-fabricated-category",
    description: "CRITICAL: an AI category id not in the org list is dropped",
    critical: true,
    input: {
      supplierId: null,
      history,
      aiCategoryId: "cat-hallucinated",
      categories: [{ id: "cat-software", name: "Software" }],
    },
    expected: { groundedAiCategoryId: null },
  },
  {
    id: "grounding-keeps-real-category",
    description: "a real AI category id is kept",
    input: {
      supplierId: null,
      history,
      aiCategoryId: "cat-software",
      categories: [{ id: "cat-software", name: "Software" }],
    },
    expected: { groundedAiCategoryId: "cat-software" },
  },
];
