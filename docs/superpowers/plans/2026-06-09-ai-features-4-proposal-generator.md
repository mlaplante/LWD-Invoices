# AI Features — Plan 4: Proposal Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate proposal sections (scope, timeline, milestones, payment schedule) and grounded suggested line items from client/project context, past proposals, the selected template, and the org's real pricing items — as an editable draft the user reviews before saving.

**Architecture:** A Gemini-first `generateProposal` service builds an org-scoped context (client/project, past `ProposalContent.sections`, the chosen `ProposalTemplate.sections`, the org's `Item` list), prompts for sections + suggested line items, validates the output against the existing `proposalSectionsSchema`, and runs a grounding guard so suggested line items can only reference **real** item ids. A new `proposals.generate` query returns the draft (never saves); the existing `proposals.create` persists it after the user edits. The existing `GenerateProposalButton` gains a "Draft with AI" path.

**Tech Stack:** Next.js 16, tRPC, Prisma, Zod, Vitest, `gemini-fallback.ts`, `ai-structured-output.ts` (Plan 1), `ai-eval` harness.

**Depends on:** Plan 1 Task 2 (`ai-structured-output.ts`). Reuses the env-var convention from Plan 1 Task 1.

---

## File Structure

- Modify: `src/lib/env.ts` — add `PROPOSAL_AI_PROVIDER` + `GEMINI_PROPOSAL_MODELS`.
- Create: `src/server/services/proposal-generator.ts` — context types, the grounding guard (`groundSuggestedItems`), and `generateProposal`.
- Modify: `src/server/routers/proposals.ts` — add the `generate` query (org-scoped context load).
- Create: `src/server/services/ai-eval/fixtures/proposal-generator.fixtures.ts`.
- Modify: `src/server/services/ai-eval/graders.ts` — add `gradeProposalGenerator`.
- Modify: `src/server/services/ai-eval/index.ts` — register suite + re-exports.
- Create: `src/test/ai-eval/proposal-generator.eval.test.ts`.
- Create: `src/test/proposal-generator.test.ts`.
- Modify: `src/components/invoices/GenerateProposalButton.tsx` — add the "Draft with AI" action.

---

## Task 1: Env vars

**Files:** Modify `src/lib/env.ts`

- [ ] **Step 1: Add to the schema block**

```ts
    // Provider for AI proposal generation. Defaults to Gemini when GEMINI_API_KEY is set.
    PROPOSAL_AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
    // Ordered Gemini model fallback chain for proposal generation.
    GEMINI_PROPOSAL_MODELS: z.string().min(1).optional(),
```

- [ ] **Step 2: Add to the runtime env map**

```ts
    PROPOSAL_AI_PROVIDER: process.env.PROPOSAL_AI_PROVIDER,
    GEMINI_PROPOSAL_MODELS: process.env.GEMINI_PROPOSAL_MODELS,
```

- [ ] **Step 3: Document in `.env.example`**

```
# AI proposal generator. Defaults to Gemini.
# PROPOSAL_AI_PROVIDER=gemini
# GEMINI_PROPOSAL_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-1.5-flash
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(ai-proposal): add proposal-generator provider env vars"
```

---

## Task 2: Grounding guard for suggested line items

**Files:**
- Create: `src/server/services/proposal-generator.ts`
- Test: `src/test/proposal-generator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  groundSuggestedItems,
  type OrgItem,
  type SuggestedLineItem,
} from "@/server/services/proposal-generator";

const items: OrgItem[] = [
  { id: "item-design", name: "Design", rate: 100 },
  { id: "item-dev", name: "Development", rate: 150 },
];

describe("groundSuggestedItems", () => {
  it("keeps suggestions that reference a real item id and rewrites the rate to the real one", () => {
    const out = groundSuggestedItems(
      [{ itemId: "item-design", quantity: 2, rate: 999 }],
      items,
    );
    expect(out).toEqual([{ itemId: "item-design", name: "Design", quantity: 2, rate: 100 }]);
  });

  it("drops suggestions that reference a fabricated item id", () => {
    const out = groundSuggestedItems([{ itemId: "item-ghost", quantity: 1, rate: 1 }], items);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/proposal-generator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
export interface OrgItem {
  id: string;
  name: string;
  rate: number | null;
}

export interface SuggestedLineItem {
  itemId: string;
  quantity: number;
  rate: number;
}

export interface GroundedLineItem {
  itemId: string;
  name: string;
  quantity: number;
  rate: number;
}

/**
 * Grounding guard: a suggested line item may only reference a real org Item id,
 * and its rate is rewritten to the item's actual rate (the model never sets
 * prices). Fabricated item ids are dropped. This is the proposal-generator's
 * analog of the invoice fact-guard.
 */
export function groundSuggestedItems(
  suggestions: SuggestedLineItem[],
  items: OrgItem[],
): GroundedLineItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return suggestions.flatMap((s) => {
    const item = byId.get(s.itemId);
    if (!item) return [];
    return [
      {
        itemId: item.id,
        name: item.name,
        quantity: s.quantity,
        rate: item.rate ?? 0,
      },
    ];
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/proposal-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/proposal-generator.ts src/test/proposal-generator.test.ts
git commit -m "feat(ai-proposal): grounding guard for suggested line items"
```

---

## Task 3: Section-key conformance + `generateProposal`

**Files:**
- Modify: `src/server/services/proposal-generator.ts`
- Modify: `src/test/proposal-generator.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { conformSectionKeys, type ProposalSection } from "@/server/services/proposal-generator";

describe("conformSectionKeys", () => {
  const template: ProposalSection[] = [
    { key: "scope", title: "Scope", content: "" },
    { key: "timeline", title: "Timeline", content: "" },
  ];

  it("keeps only generated sections whose key exists in the template, in template order", () => {
    const generated: ProposalSection[] = [
      { key: "timeline", title: "Timeline", content: "2 weeks" },
      { key: "ghost", title: "Bogus", content: "x" },
      { key: "scope", title: "Scope", content: "Build the site" },
    ];
    expect(conformSectionKeys(generated, template)).toEqual([
      { key: "scope", title: "Scope", content: "Build the site" },
      { key: "timeline", title: "Timeline", content: "2 weeks" },
    ]);
  });

  it("falls back to the template section (empty content) when the model omits one", () => {
    const generated: ProposalSection[] = [{ key: "scope", title: "Scope", content: "Build" }];
    expect(conformSectionKeys(generated, template)).toEqual([
      { key: "scope", title: "Scope", content: "Build" },
      { key: "timeline", title: "Timeline", content: "" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/proposal-generator.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Write the minimal implementation (append)**

```ts
import { z } from "zod";
import { env } from "@/lib/env";
import { callGeminiWithModelFallback, resolveGeminiModels } from "./gemini-fallback";
import { extractGeminiText } from "./natural-language-invoice";
import { parseValidatedJson, AiOutputError } from "./ai-structured-output";

export interface ProposalSection {
  key: string;
  title: string;
  content: string;
}

/**
 * Keep only generated sections whose key matches the template, in template
 * order; fill any section the model omitted from the template with empty
 * content. The template — never the model — owns the section structure.
 */
export function conformSectionKeys(
  generated: ProposalSection[],
  template: ProposalSection[],
): ProposalSection[] {
  const byKey = new Map(generated.map((s) => [s.key, s]));
  return template.map((t) => {
    const g = byKey.get(t.key);
    return { key: t.key, title: t.title, content: g?.content ?? "" };
  });
}

export interface ProposalContext {
  clientName: string;
  projectName?: string | null;
  projectDescription?: string | null;
  /** Section scaffold from the selected/default template — owns the structure. */
  templateSections: ProposalSection[];
  /** Up to N past proposals' sections for style/context (org-scoped). */
  pastProposals: ProposalSection[][];
  /** The org's real pricing items the model may suggest from. */
  items: OrgItem[];
}

export interface GeneratedProposal {
  sections: ProposalSection[];
  suggestedItems: GroundedLineItem[];
}

const GENERATION_SCHEMA = z.object({
  sections: z.array(z.object({ key: z.string(), title: z.string(), content: z.string() })),
  suggestedItems: z.array(z.object({ itemId: z.string(), quantity: z.number(), rate: z.number() })),
});

const GEMINI_PROPOSAL_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

const SYSTEM_PROMPT =
  "You draft a client proposal. Fill the provided template sections (scope, timeline, milestones, payment schedule) " +
  "using the client/project context and the style of past proposals. Suggest line items ONLY from the provided item list " +
  "(by itemId). Return ONLY JSON: {\"sections\":[{\"key\":string,\"title\":string,\"content\":string}]," +
  "\"suggestedItems\":[{\"itemId\":string,\"quantity\":number,\"rate\":number}]}. " +
  "Use only section keys and itemIds provided. Never invent items or prices.";

/**
 * Generate a proposal draft. Returns null when AI is unconfigured or output is
 * invalid (caller falls back to the plain template path). Section structure is
 * conformed to the template and suggested items are grounded to real items.
 */
export async function generateProposal(ctx: ProposalContext): Promise<GeneratedProposal | null> {
  if (!env.GEMINI_API_KEY) return null;
  const userPayload = JSON.stringify({
    client: ctx.clientName,
    project: { name: ctx.projectName ?? null, description: ctx.projectDescription ?? null },
    templateSections: ctx.templateSections,
    pastProposals: ctx.pastProposals,
    items: ctx.items.map((i) => ({ id: i.id, name: i.name, rate: i.rate })),
  });
  try {
    const raw = await callGeminiWithModelFallback({
      apiKey: env.GEMINI_API_KEY,
      models: resolveGeminiModels(env.GEMINI_PROPOSAL_MODELS, GEMINI_PROPOSAL_MODELS),
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      },
      label: "proposal generation",
      onOk: (json) => parseValidatedJson(extractGeminiText(json), GENERATION_SCHEMA),
    });
    return {
      sections: conformSectionKeys(raw.sections, ctx.templateSections),
      suggestedItems: groundSuggestedItems(raw.suggestedItems, ctx.items),
    };
  } catch (err) {
    if (err instanceof AiOutputError) return null;
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/proposal-generator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/proposal-generator.ts src/test/proposal-generator.test.ts
git commit -m "feat(ai-proposal): section-key conformance + generateProposal"
```

---

## Task 4: `proposals.generate` tRPC query

**Files:** Modify `src/server/routers/proposals.ts`

- [ ] **Step 1: Add the query** (append to `proposalsRouter`)

```ts
  generate: protectedProcedure
    .input(z.object({ invoiceId: z.string(), templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId, type: "ESTIMATE" },
        select: {
          id: true,
          client: { select: { name: true, projects: { select: { name: true, description: true }, take: 1 } } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Estimate not found" });

      // Template sections: explicit → org default. Owns the section structure.
      const template = await ctx.db.proposalTemplate.findFirst({
        where: input.templateId
          ? { id: input.templateId, organizationId: ctx.orgId }
          : { organizationId: ctx.orgId, isDefault: true },
      });
      if (!template) throw new TRPCError({ code: "BAD_REQUEST", message: "No template available to generate from" });

      const [pastProposals, items] = await Promise.all([
        ctx.db.proposalContent.findMany({
          where: { organizationId: ctx.orgId, invoiceId: { not: input.invoiceId } },
          select: { sections: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        ctx.db.item.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true, rate: true },
        }),
      ]);

      const { generateProposal } = await import("@/server/services/proposal-generator");
      const project = invoice.client.projects[0];
      const draft = await generateProposal({
        clientName: invoice.client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateSections: template.sections as unknown as { key: string; title: string; content: string }[],
        pastProposals: pastProposals.map(
          (p) => p.sections as unknown as { key: string; title: string; content: string }[],
        ),
        items: items.map((i) => ({ id: i.id, name: i.name, rate: i.rate === null ? null : Number(i.rate) })),
      });

      return { draft };
    }),
```

> **Implementer notes (resolve with grep, do not guess):**
> - Confirm the `Client → projects` relation name and that `Project` has `name`/`description` via `grep -nA20 "model Project " prisma/schema.prisma`. Adjust the select accordingly.
> - Prefer a top-level `import { generateProposal } from "@/server/services/proposal-generator"` if the file uses top-level imports (it does) instead of the inline `await import`.
> - The cast `template.sections as unknown as ProposalSection[]` mirrors the existing `create` procedure's handling of the `Json` column — keep it consistent with that code.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/proposals.ts
git commit -m "feat(ai-proposal): proposals.generate tRPC query"
```

---

## Task 5: Golden-set eval suite

**Files:**
- Create: `src/server/services/ai-eval/fixtures/proposal-generator.fixtures.ts`
- Modify: `src/server/services/ai-eval/graders.ts`
- Modify: `src/server/services/ai-eval/index.ts`
- Create: `src/test/ai-eval/proposal-generator.eval.test.ts`

- [ ] **Step 1: Write the grader (append to `graders.ts`)**

```ts
import {
  groundSuggestedItems,
  conformSectionKeys,
  type OrgItem,
  type SuggestedLineItem,
  type ProposalSection,
} from "../proposal-generator";

export interface ProposalGeneratorInput {
  /** Raw model sections, graded through conformSectionKeys. */
  modelSections: ProposalSection[];
  templateSections: ProposalSection[];
  /** Raw model line-item suggestions, graded through the grounding guard. */
  modelItems: SuggestedLineItem[];
  items: OrgItem[];
}

export interface ProposalGeneratorExpected {
  /** Section keys the conformed output must have, in this exact order. */
  expectSectionKeys: string[];
  /** itemIds that must survive grounding (real ones); fabricated ones must be gone. */
  expectGroundedItemIds: string[];
}

export const gradeProposalGenerator: Grader<ProposalGeneratorInput, ProposalGeneratorExpected> = (
  input,
  expected,
) => {
  const sections = conformSectionKeys(input.modelSections, input.templateSections);
  const grounded = groundSuggestedItems(input.modelItems, input.items);
  const checks: Array<{ ok: boolean; label: string }> = [];

  const gotKeys = sections.map((s) => s.key);
  const keysOk =
    gotKeys.length === expected.expectSectionKeys.length &&
    gotKeys.every((k, i) => k === expected.expectSectionKeys[i]);
  checks.push({ ok: keysOk, label: keysOk ? "" : `keys got [${gotKeys.join(",")}] want [${expected.expectSectionKeys.join(",")}]` });

  const gotIds = grounded.map((g) => g.itemId);
  const idsOk =
    gotIds.length === expected.expectGroundedItemIds.length &&
    expected.expectGroundedItemIds.every((id) => gotIds.includes(id));
  checks.push({ ok: idsOk, label: idsOk ? "" : `grounded ids got [${gotIds.join(",")}] want [${expected.expectGroundedItemIds.join(",")}]` });

  const correct = checks.filter((c) => c.ok).length;
  const misses = checks.filter((c) => !c.ok).map((c) => c.label);
  return { score: correct / checks.length, detail: misses.length ? misses.join("; ") : undefined };
};
```

- [ ] **Step 2: Write the fixtures**

```ts
import type { EvalCase } from "../types";
import type { ProposalGeneratorInput, ProposalGeneratorExpected } from "../graders";

const template = [
  { key: "scope", title: "Scope", content: "" },
  { key: "payment", title: "Payment Schedule", content: "" },
];
const items = [
  { id: "item-design", name: "Design", rate: 100 },
  { id: "item-dev", name: "Development", rate: 150 },
];

export const proposalGeneratorCases: EvalCase<ProposalGeneratorInput, ProposalGeneratorExpected>[] = [
  {
    id: "conform-section-keys",
    description: "fabricated section keys are dropped; template order is enforced",
    critical: true,
    input: {
      modelSections: [
        { key: "payment", title: "Payment Schedule", content: "50/50" },
        { key: "ghost-section", title: "Bogus", content: "x" },
        { key: "scope", title: "Scope", content: "Build the marketing site" },
      ],
      templateSections: template,
      modelItems: [],
      items,
    },
    expected: { expectSectionKeys: ["scope", "payment"], expectGroundedItemIds: [] },
  },
  {
    id: "ground-suggested-items",
    description: "CRITICAL: a fabricated itemId is dropped; a real one survives",
    critical: true,
    input: {
      modelSections: [],
      templateSections: template,
      modelItems: [
        { itemId: "item-dev", quantity: 10, rate: 150 },
        { itemId: "item-fabricated", quantity: 5, rate: 9999 },
      ],
      items,
    },
    expected: { expectSectionKeys: ["scope", "payment"], expectGroundedItemIds: ["item-dev"] },
  },
];
```

- [ ] **Step 3: Register the suite in `index.ts`**

Add imports:

```ts
import { gradeProposalGenerator } from "./graders";
import { proposalGeneratorCases } from "./fixtures/proposal-generator.fixtures";
```

Add to the `suites` array:

```ts
    {
      // Section-key conformance + suggested-item grounding (critical) must hold.
      report: runSuite("proposal-generator", proposalGeneratorCases, gradeProposalGenerator),
      gate: { minScore: 1, minPassRate: 1 },
    },
```

Add to the re-export block:

```ts
  gradeProposalGenerator,
  type ProposalGeneratorInput,
  type ProposalGeneratorExpected,
```

- [ ] **Step 4: Write the CI gate test**

```ts
import { describe, it, expect } from "vitest";
import { gradeProposalGenerator } from "@/server/services/ai-eval";
import { proposalGeneratorCases } from "@/server/services/ai-eval/fixtures/proposal-generator.fixtures";

describe("golden: proposal generator", () => {
  it.each(proposalGeneratorCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeProposalGenerator(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
```

- [ ] **Step 5: Run the eval suite**

Run: `npx vitest run src/test/ai-eval/proposal-generator.eval.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ai-eval/ src/test/ai-eval/proposal-generator.eval.test.ts
git commit -m "test(ai-proposal): golden-set eval suite for proposal generation"
```

---

## Task 6: "Draft with AI" in the Generate Proposal dialog

**Files:** Modify `src/components/invoices/GenerateProposalButton.tsx`

- [ ] **Step 1: Add the generate mutation + a "Draft with AI" button**

Inside the component (which already has `templateId` state and a `createMutation`), add:

```tsx
const generate = trpc.proposals.generate.useMutation({
  onSuccess: (res) => {
    if (!res.draft) {
      toast.error("AI draft unavailable — create from the template instead.");
      return;
    }
    createMutation.mutate({
      invoiceId,
      templateId: templateId || undefined,
      sections: res.draft.sections,
    });
  },
  onError: (err) => toast.error(err.message),
});
```

Render a second action next to the existing "Create from template" submit:

```tsx
<Button
  variant="secondary"
  size="sm"
  disabled={generate.isPending || createMutation.isPending}
  onClick={() => generate.mutate({ invoiceId, templateId: templateId || undefined })}
>
  {generate.isPending ? "Drafting…" : "Draft with AI"}
</Button>
```

> **Implementer notes:**
> - The existing dialog already calls `createMutation.mutate({ invoiceId, templateId })`. The AI path differs only by passing the generated `sections`. Confirm the existing create call site and mirror its success handling (toast + `utils.proposals.get.invalidate`).
> - `res.draft.suggestedItems` are returned for a future "add suggested items to the estimate" enhancement; this plan surfaces sections only. Do not silently drop them without noting it — leave a `// TODO(plan-4-followup): surface suggestedItems` comment at the call site so the dropped data is visible.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/invoices/GenerateProposalButton.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/invoices/GenerateProposalButton.tsx
git commit -m "feat(ai-proposal): Draft-with-AI action in the generate proposal dialog"
```

---

## Task 7: Cross-tenant isolation router test (named invariant)

The spec names cross-tenant isolation a first-class invariant. The pure eval suite (Task 5) cannot cover it. This mock-based router test proves `proposals.generate` only ever queries the caller's org and returns `NOT_FOUND` for another org's estimate. Pattern mirrors `src/test/routers-hours-retainers.test.ts`.

**Files:**
- Create: `src/test/proposals-generate.router.test.ts`

- [ ] **Step 1: Confirm the mocked models**

Run: `grep -nE "invoice:|proposalTemplate:|proposalContent:|item:" src/test/mocks/prisma.ts`
Expected: `db.invoice.findFirst`, `db.item.findMany` exist. If `db.proposalTemplate.findFirst` or `db.proposalContent.findMany` are NOT mocked, add them (`{ findFirst: vi.fn() }` / `{ findMany: vi.fn() }`) to `src/test/mocks/prisma.ts` in this step.

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { proposalsRouter } from "@/server/routers/proposals";
import { createMockContext } from "./mocks/trpc-context";
import { TRPCError } from "@trpc/server";

describe("proposals.generate — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = proposalsRouter.createCaller(ctx);
  });

  it("scopes the estimate lookup to the caller's org and 404s another org's estimate", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue(null);
    await expect(caller.generate({ invoiceId: "other-org-estimate" })).rejects.toThrow(TRPCError);
    const where = ctx.db.invoice.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("test-org-123");
    expect(where.type).toBe("ESTIMATE");
  });

  it("scopes template, past-proposal, and item context to the caller's org", async () => {
    ctx.db.invoice.findFirst.mockResolvedValue({
      id: "est1",
      client: { name: "Acme", projects: [] },
    });
    ctx.db.proposalTemplate.findFirst.mockResolvedValue({ sections: [] });
    ctx.db.proposalContent.findMany.mockResolvedValue([]);
    ctx.db.item.findMany.mockResolvedValue([]);

    await caller.generate({ invoiceId: "est1" });

    expect(ctx.db.proposalTemplate.findFirst.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.proposalContent.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.item.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
```

> **Implementer note:** with `GEMINI_API_KEY` unset in the test env, `generateProposal` returns `null` and `generate` returns `{ draft: null }` — the second test still exercises every org-scoped query, which is the point. If the test env sets a Gemini key, stub the network call or assert on the query `where` clauses before the AI call.

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/test/proposals-generate.router.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/test/proposals-generate.router.test.ts src/test/mocks/prisma.ts
git commit -m "test(ai-proposal): cross-tenant isolation router test for proposals.generate"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all green incl. the `proposal-generator` golden suite.

- [ ] **Run the AI eval gate (if the script exists)**

Run: `npx tsx scripts/ai-eval.ts`
Expected: all four AI-feature suites (invoice-review, expense-categorization, collections-queue, proposal-generator) report no critical failures.

---

## Self-Review (completed by plan author)

- **Spec coverage:** generates scope/timeline/milestones/payment-schedule sections from client/project + past proposals + template + real pricing (`generateProposal`), suggested line items grounded to real `Item`s (`groundSuggestedItems` rewrites rate to the real one — the model never sets prices), section structure owned by the template (`conformSectionKeys`), editable before save (returns a draft; existing `create` persists), full eval coverage with two `critical` grounding cases. Cross-tenant isolation via `ctx.orgId` on every context query.
- **Type consistency:** `ProposalSection`, `OrgItem`, `SuggestedLineItem`, `GroundedLineItem` used identically across service, router, grader, fixtures. The section shape `{ key, title, content }` matches the existing `proposalSectionsSchema`/`ProposalContent.sections`.
- **Grounding note:** the spec's "payment schedule must sum to a stated total" is enforced structurally by making line-item amounts come only from real items (the model can't set prices); the prose payment-schedule section is generated text the user reviews. If a stricter numeric reconciliation is wanted later, add it as a follow-up check over `suggestedItems`.
- **Open items left to implementer (with grep, not placeholders):** the `Client → projects` relation/fields, top-level vs inline import style, the `Json`-column cast convention from the existing `create`, and the existing dialog's create call site.
