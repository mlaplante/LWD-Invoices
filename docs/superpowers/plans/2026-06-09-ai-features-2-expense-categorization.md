# AI Features — Plan 2: Expense Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest an expense's tax category, reimbursable flag, and project/client association — learned from the org's past supplier→category patterns, with a grounded LLM fallback for new suppliers.

**Architecture:** A pure `suggestFromHistory` does a deterministic majority-vote over the org's prior expenses for the same supplier. When history is thin/absent, a Gemini-first LLM classifies against the org's **existing** `ExpenseCategory` list (grounded — it can only return a real category id). A tRPC query exposes suggestions read-only; the expense form shows accept-to-fill chips.

**Tech Stack:** Next.js 16, tRPC, Prisma, Zod, Vitest, `gemini-fallback.ts`, `ai-structured-output.ts` (from Plan 1), the `ai-eval` harness.

**Depends on:** Plan 1 Task 2 (`ai-structured-output.ts`). Reuses the env-var convention from Plan 1 Task 1.

---

## File Structure

- Modify: `src/lib/env.ts` — add `EXPENSE_CATEGORY_AI_PROVIDER` + `GEMINI_EXPENSE_CATEGORY_MODELS`.
- Create: `src/server/services/expense-categorization.ts` — `suggestFromHistory` (pure), `classifyWithAi` (LLM, grounded), `suggestCategorization` (aggregator).
- Modify: `src/server/routers/expenses.ts` — add `suggestCategorization` query.
- Create: `src/server/services/ai-eval/fixtures/expense-categorization.fixtures.ts`.
- Modify: `src/server/services/ai-eval/graders.ts` — add `gradeExpenseCategorization`.
- Modify: `src/server/services/ai-eval/index.ts` — register suite + re-exports.
- Create: `src/test/ai-eval/expense-categorization.eval.test.ts`.
- Create: `src/test/expense-categorization.test.ts`.
- Modify: `src/components/expenses/ExpenseForm.tsx` — inline suggestion chips.

---

## Task 1: Env vars

**Files:** Modify `src/lib/env.ts`

- [ ] **Step 1: Add to the schema block** (after the Plan 1 invoice-review vars)

```ts
    // Provider for the expense-categorization LLM fallback (new/ambiguous
    // suppliers only). Defaults to Gemini when GEMINI_API_KEY is set.
    EXPENSE_CATEGORY_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Ordered Gemini model fallback chain for expense categorization.
    GEMINI_EXPENSE_CATEGORY_MODELS: z.string().min(1).optional(),
```

- [ ] **Step 2: Add to the runtime env map**

```ts
    EXPENSE_CATEGORY_AI_PROVIDER: process.env.EXPENSE_CATEGORY_AI_PROVIDER,
    GEMINI_EXPENSE_CATEGORY_MODELS: process.env.GEMINI_EXPENSE_CATEGORY_MODELS,
```

- [ ] **Step 3: Document in `.env.example`**

```
# AI expense categorization (LLM fallback for new suppliers). Defaults to Gemini.
# EXPENSE_CATEGORY_AI_PROVIDER=gemini
# GEMINI_EXPENSE_CATEGORY_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-1.5-flash
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(ai-expense): add expense-categorization provider env vars"
```

---

## Task 2: Deterministic history-based suggestion

**Files:**
- Create: `src/server/services/expense-categorization.ts`
- Test: `src/test/expense-categorization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  suggestFromHistory,
  type PastExpense,
  type CategorizationSuggestion,
} from "@/server/services/expense-categorization";

const history: PastExpense[] = [
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: "p1" },
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: false, projectId: "p1" },
  { supplierId: "s1", categoryId: "cat-software", taxId: "t1", reimbursable: true, projectId: null },
  { supplierId: "s2", categoryId: "cat-travel", taxId: null, reimbursable: true, projectId: null },
];

describe("suggestFromHistory", () => {
  it("majority-votes category/tax/reimbursable for a known supplier", () => {
    const s = suggestFromHistory("s1", history);
    expect(s).not.toBeNull();
    expect((s as CategorizationSuggestion).categoryId).toBe("cat-software");
    expect((s as CategorizationSuggestion).taxId).toBe("t1");
    expect((s as CategorizationSuggestion).reimbursable).toBe(false); // 2 of 3
    expect((s as CategorizationSuggestion).source).toBe("history");
  });

  it("reports confidence as the winning fraction", () => {
    const s = suggestFromHistory("s1", history) as CategorizationSuggestion;
    expect(s.confidence).toBeCloseTo(1.0); // 3/3 chose cat-software
  });

  it("returns null for a supplier with no history", () => {
    expect(suggestFromHistory("unknown", history)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/expense-categorization.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/expense-categorization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/expense-categorization.ts src/test/expense-categorization.test.ts
git commit -m "feat(ai-expense): deterministic history-based categorization"
```

---

## Task 3: Grounded LLM fallback + aggregator

**Files:**
- Modify: `src/server/services/expense-categorization.ts`
- Modify: `src/test/expense-categorization.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { groundAiCategory, type OrgCategory } from "@/server/services/expense-categorization";

const cats: OrgCategory[] = [
  { id: "cat-software", name: "Software" },
  { id: "cat-travel", name: "Travel" },
];

describe("groundAiCategory", () => {
  it("keeps an AI category id that exists", () => {
    expect(groundAiCategory("cat-travel", cats)).toBe("cat-travel");
  });

  it("drops a fabricated AI category id", () => {
    expect(groundAiCategory("cat-made-up", cats)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/expense-categorization.test.ts`
Expected: FAIL — `groundAiCategory` not exported.

- [ ] **Step 3: Write the minimal implementation (append)**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/expense-categorization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/expense-categorization.ts src/test/expense-categorization.test.ts
git commit -m "feat(ai-expense): grounded LLM fallback + suggestion aggregator"
```

---

## Task 4: tRPC query (org-scoped history + category load)

**Files:** Modify `src/server/routers/expenses.ts`

- [ ] **Step 1: Add the query** (alongside the existing `categorizeMany`/`create` procedures)

```ts
  suggestCategorization: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        supplierId: z.string().nullable(),
        supplierName: z.string(),
        expenseName: z.string(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Org-scoped history (last 500 categorized expenses) + the org's categories.
      const [history, categories] = await Promise.all([
        ctx.db.expense.findMany({
          where: { organizationId: ctx.orgId, categoryId: { not: null } },
          select: { supplierId: true, categoryId: true, taxId: true, reimbursable: true, projectId: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        ctx.db.expenseCategory.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true },
        }),
      ]);

      const { suggestCategorization } = await import("@/server/services/expense-categorization");
      const suggestion = await suggestCategorization({
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        expenseName: input.expenseName,
        description: input.description ?? null,
        history,
        categories,
      });
      return { suggestion };
    }),
```

> **Implementer note:** import `suggestCategorization` at the top of the file with the other service imports instead of the inline `await import(...)` if that matches the file's existing style (it uses top-level imports — prefer that). Confirm `ctx.orgId` is the org accessor used elsewhere in this router via `grep -n "ctx.orgId" src/server/routers/expenses.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/expenses.ts
git commit -m "feat(ai-expense): expenses.suggestCategorization tRPC query"
```

---

## Task 5: Golden-set eval suite

**Files:**
- Create: `src/server/services/ai-eval/fixtures/expense-categorization.fixtures.ts`
- Modify: `src/server/services/ai-eval/graders.ts`
- Modify: `src/server/services/ai-eval/index.ts`
- Create: `src/test/ai-eval/expense-categorization.eval.test.ts`

- [ ] **Step 1: Write the grader (append to `graders.ts`)**

```ts
import {
  suggestFromHistory,
  groundAiCategory,
  type PastExpense,
  type OrgCategory,
} from "../expense-categorization";

export interface ExpenseCategorizationInput {
  supplierId: string | null;
  history: PastExpense[];
  /** Optional AI-returned id, graded through the grounding guard. */
  aiCategoryId?: string | null;
  categories?: OrgCategory[];
}

export interface ExpenseCategorizationExpected {
  /** Expected deterministic category from history, or null to expect no history match. */
  historyCategoryId?: string | null;
  /** After grounding, the AI id must resolve to this (null = dropped). */
  groundedAiCategoryId?: string | null;
}

export const gradeExpenseCategorization: Grader<
  ExpenseCategorizationInput,
  ExpenseCategorizationExpected
> = (input, expected) => {
  const checks: Array<{ ok: boolean; label: string }> = [];

  if (expected.historyCategoryId !== undefined) {
    const got = suggestFromHistory(input.supplierId, input.history)?.categoryId ?? null;
    const ok = got === expected.historyCategoryId;
    checks.push({ ok, label: ok ? "" : `history category got ${got} want ${expected.historyCategoryId}` });
  }

  if (expected.groundedAiCategoryId !== undefined) {
    const got = groundAiCategory(input.aiCategoryId ?? null, input.categories ?? []);
    const ok = got === expected.groundedAiCategoryId;
    checks.push({ ok, label: ok ? "" : `grounded ai got ${got} want ${expected.groundedAiCategoryId}` });
  }

  const total = checks.length;
  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: total === 0 ? 1 : correct / total, detail: misses.length ? misses.join("; ") : undefined };
};
```

- [ ] **Step 2: Write the fixtures**

```ts
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
```

- [ ] **Step 3: Register the suite in `index.ts`**

Add imports:

```ts
import { gradeExpenseCategorization } from "./graders";
import { expenseCategorizationCases } from "./fixtures/expense-categorization.fixtures";
```

Add to the `suites` array:

```ts
    {
      // Majority-vote determinism + the AI-category grounding guard (critical).
      report: runSuite("expense-categorization", expenseCategorizationCases, gradeExpenseCategorization),
      gate: { minScore: 1, minPassRate: 1 },
    },
```

Add to the re-export block:

```ts
  gradeExpenseCategorization,
  type ExpenseCategorizationInput,
  type ExpenseCategorizationExpected,
```

- [ ] **Step 4: Write the CI gate test**

```ts
import { describe, it, expect } from "vitest";
import { gradeExpenseCategorization } from "@/server/services/ai-eval";
import { expenseCategorizationCases } from "@/server/services/ai-eval/fixtures/expense-categorization.fixtures";

describe("golden: expense categorization", () => {
  it.each(expenseCategorizationCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeExpenseCategorization(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
```

- [ ] **Step 5: Run the eval suite**

Run: `npx vitest run src/test/ai-eval/expense-categorization.eval.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ai-eval/ src/test/ai-eval/expense-categorization.eval.test.ts
git commit -m "test(ai-expense): golden-set eval suite for categorization"
```

---

## Task 6: Inline suggestion in the expense form

**Files:** Modify `src/components/expenses/ExpenseForm.tsx`

- [ ] **Step 1: Inspect the form's field state**

Run: `grep -nE "useState|categoryId|supplierId|reimbursable|projectId|trpc" src/components/expenses/ExpenseForm.tsx | head -40`
Expected: identifies the state setters for category/tax/reimbursable/project and the supplier field. Note their names for Step 2.

- [ ] **Step 2: Add the suggestion mutation + a "Suggest" affordance**

Inside the component, add (using the real state setter names found in Step 1):

```tsx
const suggest = trpc.expenses.suggestCategorization.useMutation();

function applySuggestion() {
  const s = suggest.data?.suggestion;
  if (!s) return;
  if (s.categoryId) setCategoryId(s.categoryId);
  if (s.taxId) setTaxId(s.taxId);
  setReimbursable(s.reimbursable);
  if (s.projectId) setProjectId(s.projectId);
}
```

Render near the category field:

```tsx
<button
  type="button"
  className="text-sm text-sky-700 underline"
  onClick={() =>
    suggest.mutate({
      supplierId: supplierId || null,
      supplierName: supplierName ?? "",
      expenseName: name ?? "",
      description: description ?? null,
    })
  }
  disabled={suggest.isPending}
>
  {suggest.isPending ? "Suggesting…" : "Suggest category"}
</button>

{suggest.data?.suggestion && (
  <div className="mt-1 flex items-center gap-2 text-sm">
    <span className="text-gray-600">
      Suggested ({Math.round(suggest.data.suggestion.confidence * 100)}% · {suggest.data.suggestion.source})
    </span>
    <button type="button" className="rounded border px-2 py-0.5 hover:bg-gray-50" onClick={applySuggestion}>
      Apply
    </button>
  </div>
)}
{suggest.data && suggest.data.suggestion === null && (
  <p className="mt-1 text-sm text-gray-500">No confident suggestion — pick a category manually.</p>
)}
```

> **Implementer note:** match the actual state variable/setter names (e.g. `categoryId`/`setCategoryId`) and the supplier text source from Step 1. Do not introduce new field names.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/expenses/ExpenseForm.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/expenses/ExpenseForm.tsx
git commit -m "feat(ai-expense): inline category suggestion in expense form"
```

---

## Task 7: Cross-tenant isolation router test (named invariant)

The spec names cross-tenant isolation a first-class invariant. The pure eval suite (Task 5) cannot cover it — graders make no DB calls. This mock-based router test proves `suggestCategorization` loads history and categories scoped to the caller's org only. Pattern mirrors `src/test/routers-hours-retainers.test.ts`.

**Files:**
- Create: `src/test/expenses-suggest.router.test.ts`

- [ ] **Step 1: Confirm the mock has the models this query uses**

Run: `grep -nE "expense:|expenseCategory:" src/test/mocks/prisma.ts`
Expected: `db.expense.findMany` exists. If `db.expenseCategory.findMany` is NOT mocked, add `expenseCategory: { findMany: vi.fn() }` to `src/test/mocks/prisma.ts` in this step.

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";

describe("expenses.suggestCategorization — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = expensesRouter.createCaller(ctx);
    ctx.db.expense.findMany.mockResolvedValue([]);
    ctx.db.expenseCategory.findMany.mockResolvedValue([]);
  });

  it("loads history and categories scoped to the caller's org", async () => {
    await caller.suggestCategorization({
      supplierId: "s1",
      supplierName: "AWS",
      expenseName: "Hosting",
      description: null,
    });
    expect(ctx.db.expense.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.expenseCategory.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/test/expenses-suggest.router.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/test/expenses-suggest.router.test.ts src/test/mocks/prisma.ts
git commit -m "test(ai-expense): cross-tenant isolation router test for suggestCategorization"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all green incl. the `expense-categorization` golden suite.

---

## Self-Review (completed by plan author)

- **Spec coverage:** history-in-context majority vote (`suggestFromHistory`), grounded LLM fallback for new suppliers (`classifyWithAi` + `groundAiCategory`), suggests category/tax/reimbursable/project into existing `Expense` fields, full eval coverage incl. a `critical` grounding case and a no-history case. Cross-tenant isolation enforced by the router loading both history and categories filtered on `ctx.orgId`.
- **Type consistency:** `CategorizationSuggestion`, `PastExpense`, `OrgCategory` used identically across service, router, grader, fixtures. `source` is `'history' | 'ai'` everywhere.
- **Open items left to implementer (with grep, not placeholders):** the exact `ctx.orgId` accessor in `expenses.ts`, the import style (top-level vs inline), and the `ExpenseForm` state setter names.
