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

// ─── Task 3: Grounded LLM fallback + aggregator ───────────────────────────────

import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson, AiOutputError } from "./ai-structured-output";

export interface OrgCategory {
  id: string;
  name: string;
}

/** Grounding guard: an AI-chosen category id must be one the org actually has. */
export function groundAiCategory(categoryId: string | null, categories: OrgCategory[]): string | null {
  if (!categoryId) return null;
  return categories.some((c) => c.id === categoryId) ? categoryId : null;
}

const AI_SCHEMA = z.object({
  categoryId: z.string().nullable(),
  reimbursable: z.boolean(),
});

const GEMINI_CATEGORY_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

export interface ClassifyInput {
  supplierName: string;
  expenseName: string;
  description?: string | null;
}

/**
 * LLM fallback: classify against the org's EXISTING categories. The model is
 * told to pick a real id; `groundAiCategory` enforces it. Returns null when AI
 * is unconfigured or the output is invalid/ungrounded.
 */
export async function classifyWithAi(
  input: ClassifyInput,
  categories: OrgCategory[],
): Promise<CategorizationSuggestion | null> {
  if (!env.GEMINI_API_KEY || categories.length === 0) return null;
  const systemPrompt =
    "You categorize a business expense. Choose the single best category from the provided list. " +
    "Return ONLY JSON {\"categoryId\":string|null,\"reimbursable\":boolean}. " +
    "categoryId MUST be one of the provided ids, or null if none fit. Never invent an id.";
  const userPayload = JSON.stringify({
    expense: { name: input.expenseName, description: input.description ?? "", supplier: input.supplierName },
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  });
  try {
    const ai = await callGeminiWithModelFallback({
      apiKey: env.GEMINI_API_KEY,
      models: resolveGeminiModels(env.GEMINI_EXPENSE_CATEGORY_MODELS, GEMINI_CATEGORY_MODELS),
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
      label: "expense categorization",
      onOk: (json) => parseValidatedJson(extractGeminiText(json), AI_SCHEMA),
    });
    const groundedId = groundAiCategory(ai.categoryId, categories);
    if (!groundedId) return null;
    return {
      categoryId: groundedId,
      taxId: null,
      reimbursable: ai.reimbursable,
      projectId: null,
      confidence: 0.5,
      source: "ai",
    };
  } catch (err) {
    if (err instanceof AiOutputError) return null;
    return null;
  }
}

export interface SuggestCategorizationInput {
  supplierId: string | null;
  supplierName: string;
  expenseName: string;
  description?: string | null;
  history: PastExpense[];
  categories: OrgCategory[];
}

/** History first; LLM fallback only when there's no supplier history. */
export async function suggestCategorization(
  input: SuggestCategorizationInput,
): Promise<CategorizationSuggestion | null> {
  const fromHistory = suggestFromHistory(input.supplierId, input.history);
  if (fromHistory) return fromHistory;
  return classifyWithAi(
    { supplierName: input.supplierName, expenseName: input.expenseName, description: input.description },
    input.categories,
  );
}
