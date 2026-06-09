# AI Features Release — Design

**Date:** 2026-06-09
**Branch:** `aifeatures`
**Status:** Approved (design), pending implementation plan

## Summary

Ship four AI-assisted features as a single release, built on the existing
Gemini-first model-fallback infrastructure:

1. **AI invoice reviewer** — pre-send checks (missing tax/address, suspicious
   discounts, unbilled time, duplicate-invoice risk, unclear line descriptions).
2. **AI expense categorization** — suggests tax category + reimbursable/client/
   project association, learned from the org's supplier/category history.
3. **AI collections copilot** — ranked daily queue (who to chase, suggested tone,
   risk explanation, one-click send). **~80% already exists**; only the ranked
   queue query + UI are new.
4. **AI proposal generator** — generates scope/timeline/milestones/payment
   schedule from client/project context, past proposals, templates, pricing.

All four are **human-in-the-loop** (suggest/draft only; the user reviews and
commits). Implementation is sequenced inside one release so each slice is
verifiable end-to-end.

## Design Principles (apply to all four features)

- **Gemini-first provider:** reuse `src/server/services/gemini-fallback.ts`
  (`callGeminiWithModelFallback` + `resolveGeminiModels`). Anthropic/OpenAI are
  configured fallbacks. Per-feature env vars follow the existing
  `GEMINI_<FEATURE>_MODELS` + `<FEATURE>_AI_PROVIDER` enum convention from
  `src/lib/env.ts`.
- **Validated structured output:** mirror `natural-language-invoice.ts` — JSON
  schema + `responseMimeType` for Gemini, `JSON.parse` → **Zod `safeParse`**, with
  a deterministic fallback when output is invalid. Extract the parse+validate step
  into one shared helper (`ai-structured-output.ts`) so all four validate
  identically.
- **Deterministic core, LLM only for fuzzy language.** Ranking, duplicate
  detection, majority-vote categorization, and threshold checks are deterministic
  and explainable. The LLM is used only for natural-language judgment/generation.
- **🔒 Cross-tenant isolation (named invariant).** Every history/context query is
  scoped to `ctx.orgId`. No cross-org row ever enters a prompt. Each feature gets
  a dedicated **router integration test** asserting this (mock-based, mirroring
  `src/test/routers-hours-retainers.test.ts`). Note: the pure golden-set eval
  harness *cannot* test org-scoping — its graders make no DB calls and operate on
  an already-scoped snapshot — so this invariant lives in router tests, while the
  eval suites' grounding cases cover the separate LLM-output boundary. (Directly
  guards the bug class fixed in commit `f7f22b1`.)
- **No new database tables.** All four read existing data and write existing
  fields. If persistence is ever wanted (dismissed-warning memory, queue
  snapshots), that is a deliberate future addition, not part of this release.
- **Eval coverage (full):** extend the `src/server/services/ai-eval` harness with
  fixtures + grounding graders for each feature.

## Feature 1 — AI Invoice Reviewer (new)

**Files:** `src/server/services/invoice-review.ts`,
`src/server/routers/invoiceReview.ts` (or add to `invoices.ts`), pre-send review
panel component under `src/components/invoices/`.

**Checks (deterministic):**
- *Missing tax/address info* — client billing address + tax id, org tax config.
- *Suspicious discounts* — discount % above a threshold relative to line/invoice
  total.
- *Unbilled time* — open `TimeEntry` rows for the invoice's project/client that
  are not yet attached to any invoice line.
- *Duplicate-invoice risk* — fuzzy match against recent invoices for the same
  client: same/near amount + similar line signature within a recency window.

**Check (LLM):**
- *Unclear line descriptions* — flag vague lines (e.g. "work", "services") and
  suggest clearer wording. Grounded: references only the actual line text.

**Output:** ephemeral `ReviewFinding[]` = `{ severity, code, message, fields[] }`.
Advisory and non-blocking; no persistence. Surfaced in a review panel/dialog on
the invoice detail page before send.

**Router:** `invoiceReview.review({ invoiceId })` — read-only compute, org-scoped.

## Feature 2 — AI Expense Categorization (new)

**Files:** `src/server/services/expense-categorization.ts`, add
`suggestCategorization` to `src/server/routers/expenses.ts`, inline suggestion UI
in the expense create/edit form under `src/components/expenses/`.

**Logic:**
- *Deterministic (primary):* group the org's past `Expense` rows by supplier →
  majority-vote `categoryId` / `taxId` / `reimbursable` / `projectId`; confidence
  derived from frequency/consistency.
- *LLM (fallback, new/ambiguous suppliers only):* classify against the org's
  **existing** `ExpenseCategory` list. Grounded — must select an existing category
  id; never invents categories.

**Output:** `{ categoryId, taxId, reimbursable, projectId?, confidence,
source: 'history' | 'ai' }`. Fills the existing `Expense` fields; user accepts/edits.

**Router:** `expenses.suggestCategorization({ supplierId?, supplierName?,
name, description?, amount? })` — org-scoped.

## Feature 3 — AI Collections Copilot (mostly exists)

**Already built (reuse, do not rebuild):**
- `src/server/services/collection-risk.ts` → `scoreCollectionRisk` (risk score +
  band + recommended action + tone).
- `src/server/services/client-payment-score.ts` → payment behavior summary.
- `src/server/routers/collections.ts` → `draftReminder` (Gemini-first, fact-
  guarded) + `sendReminder` (one-click send wired to `sendEmail` + `InvoiceReminder`
  pipeline, with bounce/complaint suppression).

**New code (the only gap):**
- `collections.queue` query — aggregate the org's overdue/at-risk invoices, score
  each with `scoreCollectionRisk`, rank by risk × amount, return queue items:
  `{ invoice, client, riskScore, band, action, tone, riskReasons }`.
- `/collections` daily-queue UI page under `src/app/(dashboard)/collections/` +
  `src/components/collections/` — ranked list with per-row risk explanation +
  suggested tone, draft preview (existing `draftReminder`), one-click send
  (existing `sendReminder`). Drafting/sending are **not** rebuilt.

## Feature 4 — AI Proposal Generator (new)

**Files:** `src/server/services/proposal-generator.ts`, add `generate` to a
proposals router, "Generate with AI" action in the estimate/proposal editor.

**Context (all org-scoped):** client/project record, the org's past
`ProposalContent.sections`, the selected `ProposalTemplate.sections`, the org's
real `Item` pricing list.

**LLM generation:** produce `sections` JSON (matching the `ProposalContent.sections`
shape: array of `{ key, title, content }`) covering scope, timeline, milestones,
and payment schedule, plus suggested line items drawn from **real `Item`s**.

**Grounding:** payment schedule must sum to a stated total; milestones reference
real project `Milestone`s where present; suggested line items reference real item
ids/prices. Output is editable before save and **never auto-saves**.

**Router:** `proposals.generate({ invoiceId | clientId, templateId? })`.

## Eval Coverage

New fixtures under `src/server/services/ai-eval/fixtures/`:
- `invoice-review.fixtures.ts` — including hallucinated-invoice-fact and
  cross-tenant cases.
- `expense-categorization.fixtures.ts` — including fabricated-category and
  cross-tenant cases.
- `collections-queue.fixtures.ts` — ranking determinism (same inputs → same order).
- `proposal-generator.fixtures.ts` — including fabricated-money/terms and
  cross-tenant cases.

Grounding graders assert: no hallucinated invoice facts, categories chosen from the
real list, proposal money/terms grounded in real items/totals, and **no cross-org
data leakage** in any feature.

## Implementation Sequence (one release, sequenced)

1. **Scaffold** — per-feature env vars, shared `ai-structured-output.ts`
   parse+validate helper, eval-harness extension points.
2. **Invoice reviewer** — most deterministic; proves the end-to-end pattern.
3. **Expense categorization** — history-in-context classifier + LLM fallback.
4. **Collections copilot** — `queue` query + `/collections` UI over existing stack.
5. **Proposal generator** — most generative; relies on the proven scaffold.

## Out of Scope (YAGNI)

- Persisted accept/reject feedback loops (history-in-context chosen instead).
- Auto-sending or auto-saving any AI output (everything is review-gated).
- New tables / schema migrations.
- LLM-based ranking of the collections queue (ranking stays deterministic and
  explainable).
