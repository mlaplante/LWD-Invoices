export type SuggestionSource = "history" | "ai";

export interface PastExpense {
  supplierId: string | null;
  categoryId: string | null;
  taxId: string | null;
  reimbursable: boolean;
  projectId: string | null;
}

export interface CategorizationSuggestion {
  categoryId: string | null;
  taxId: string | null;
  reimbursable: boolean;
  projectId: string | null;
  /** 0..1 — for history, the winning category's fraction of supplier rows. */
  confidence: number;
  source: SuggestionSource;
}

function majority<T>(values: T[]): { value: T; fraction: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, fraction: bestCount / values.length };
}

/**
 * Deterministic suggestion from the org's prior expenses for this supplier.
 * Returns null when the supplier has no history (caller falls back to the LLM).
 * `history` MUST already be org-scoped by the caller.
 */
export function suggestFromHistory(
  supplierId: string | null,
  history: PastExpense[],
): CategorizationSuggestion | null {
  if (!supplierId) return null;
  const rows = history.filter((e) => e.supplierId === supplierId);
  if (rows.length === 0) return null;

  const categoryVote = majority(rows.map((r) => r.categoryId));
  const taxVote = majority(rows.map((r) => r.taxId));
  const reimbVote = majority(rows.map((r) => r.reimbursable));
  const projectVote = majority(rows.map((r) => r.projectId));

  return {
    categoryId: categoryVote?.value ?? null,
    taxId: taxVote?.value ?? null,
    reimbursable: reimbVote?.value ?? false,
    projectId: projectVote?.value ?? null,
    confidence: categoryVote?.fraction ?? 0,
    source: "history",
  };
}
