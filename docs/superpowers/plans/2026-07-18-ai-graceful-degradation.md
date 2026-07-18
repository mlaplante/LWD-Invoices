# AI Graceful Degradation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every AI surface fails soft when no AI provider key is configured: no hard throws, no silently-zeroed data, AI-only controls hidden or clearly labeled, degraded results flagged.

**Architecture:** Introduce one shared helper (`src/server/services/ai-availability.ts`) + one tRPC capability query the client can use to hide AI-only controls. Then fix the four audited gaps: (1) `reports.weeklyBriefing`'s bogus key gate, (2) receipt-OCR hard throw, (3) natural-language-invoice hard throw, (4) the dead `deterministicOnly`/`aiUnavailable` signal in invoice draft QA. Reference patterns to imitate: `resolveAssistantProvider()` in `src/server/services/books-assistant.ts:627-665` (typed unavailable, never throws) and `templateDraft(..., "missing_ai_config")` in `src/server/services/smart-reminder-drafts.ts:295-370` (labeled fallback).

**Audited facts (2026-07-18 — trust these, don't re-derive):**
- All three keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) are optional in `src/lib/env.ts:57-58`; app boots keyless.
- `receipt-ocr.ts:89-101` `resolveProvider()` defaults to `"anthropic"` with zero keys → throws in `parseReceiptWithAnthropic` (line 156); no catch in `expenses.scanReceipt` chain.
- `natural-language-invoice.ts:312-322` defaults to `"gemini"` keyless → throws at line 384-386; no catch in `invoices.ts:410`.
- `reports.ts:945-980` `weeklyBriefing` gates on `process.env.GEMINI_API_KEY` (line 964) and returns zeroed data keyless — but `buildWeeklyBriefing` (`weekly-briefing.ts`) is fully deterministic, no AI call. `analytics.ts:427,454` and the Inngest job call it unconditionally and work.
- `invoice-draft-qa.ts:548` hardcodes `hasPartial = false`, so `summary.deterministicOnly` / `guardrails.aiUnavailable` never fire; client `InvoiceDraftQA.tsx:97` already renders them.
- No Inngest/scheduled job imports any AI service — background jobs need no changes.
- Already-graceful (do NOT touch): smart reminders, cash-flow narrative, books assistant, proposal generation, invoice-review AI check gating, collections scoring (not AI at all).

**Out of scope (do not do):** implementing OpenAI/Anthropic branches for `INVOICE_REVIEW_AI_PROVIDER`/`PROPOSAL_AI_PROVIDER` (Gemini-only today); redesigning any AI UX.

---

### Task 1: Shared availability helper

**Files:**
- Create: `src/server/services/ai-availability.ts`
- Test: `src/test/ai-availability.test.ts`

- [x] **Step 1:** Failing tests (mock `@/lib/env` the way existing service tests do — grep `vi.mock("@/lib/env"` for the established pattern):

```ts
import { describe, expect, it, vi } from "vitest";

describe("ai-availability", () => {
  it("reports no providers when no keys set", async () => {
    // env mocked with all three keys undefined
    const { getAiAvailability } = await import("@/server/services/ai-availability");
    expect(getAiAvailability()).toEqual({
      gemini: false,
      openai: false,
      anthropic: false,
      anyConfigured: false,
    });
  });
  it("reports anyConfigured when at least one key set", async () => {
    // env mocked with GEMINI_API_KEY: "x"
    const { getAiAvailability } = await import("@/server/services/ai-availability");
    expect(getAiAvailability().anyConfigured).toBe(true);
    expect(getAiAvailability().gemini).toBe(true);
  });
});
```

- [x] **Step 2:** Run → FAIL. **Step 3:** Implement:

```ts
import { env } from "@/lib/env";

export type AiAvailability = {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  anyConfigured: boolean;
};

export function getAiAvailability(): AiAvailability {
  const gemini = Boolean(env.GEMINI_API_KEY);
  const openai = Boolean(env.OPENAI_API_KEY);
  const anthropic = Boolean(env.ANTHROPIC_API_KEY);
  return { gemini, openai, anthropic, anyConfigured: gemini || openai || anthropic };
}
```

- [x] **Step 4:** PASS → commit.

### Task 2: Client capability query

**Files:**
- Modify: the most settings-like existing router (check `src/server/routers/_app.ts` for a `settings`/`organization`/`system` router; if none fits, create `src/server/routers/system.ts` and register `system: systemRouter`)
- Test: extend that router's existing procedure test file (or create one following `src/test/routers-*-procedures.test.ts` conventions)

- [x] **Step 1:** Add a `protectedProcedure` query `aiCapabilities` returning `getAiAvailability()` but ONLY the shape the client needs — do not leak which specific vendor keys exist:

```ts
aiCapabilities: protectedProcedure.query(() => {
  const a = getAiAvailability();
  return { aiEnabled: a.anyConfigured };
}),
```

- [x] **Step 2:** Test: keyless → `{ aiEnabled: false }`; with a key → `{ aiEnabled: true }`. Commit.

### Task 3: Fix `reports.weeklyBriefing` zeroed-data gate

**Files:**
- Modify: `src/server/routers/reports.ts:945-980`
- Test: extend the reports router test file (grep `weeklyBriefing` under `src/test/`)

- [x] **Step 1:** Failing test: with no `GEMINI_API_KEY`, `reports.weeklyBriefing` returns real data from the underlying builder (mock `getWeeklyBriefing`/`buildWeeklyBriefing` to return a non-zero fixture) and no `hasAIError`.
- [x] **Step 2:** Remove the `process.env.GEMINI_API_KEY` gate at line 964 and the zeroed-payload branch; call the same builder path `analytics.ts:427,454` uses, unconditionally. Keep the response shape otherwise identical (clients depend on it); `hasAIError` should be absent/undefined keyless.
- [x] **Step 3:** PASS → run the FULL reports + analytics test files → all green → commit.

### Task 4: Receipt OCR fails soft

**Files:**
- Modify: `src/server/services/receipt-ocr.ts:89-101` (`resolveProvider`)
- Modify: `src/server/routers/expenses.ts:83-112` (`scanReceipt`)
- Modify: `src/components/projects/ExpenseForm.tsx` (hide scan affordance when `aiEnabled` is false; friendly message)
- Test: extend receipt-ocr / expenses router tests

- [x] **Step 1:** Failing tests: (a) `resolveProvider` returns `null` when zero keys; (b) `scanReceipt` keyless returns typed `{ unavailable: true, message }` (or throws `TRPCError` `PRECONDITION_FAILED` with the friendly message IF the existing client error-toast path is kept — prefer the typed result; pick one and make client+server consistent); (c) with a key present, behavior unchanged.
- [x] **Step 2:** Implement: `resolveProvider` checks which keys exist (respect existing provider-preference env var if there is one) and returns `null` when none. `scanReceipt` short-circuits:

```ts
const provider = resolveProvider();
if (!provider) {
  return {
    unavailable: true as const,
    message:
      "Receipt scanning requires an AI provider key (Settings → AI). Enter the expense details manually.",
  };
}
```

  Update the client: when the mutation result has `unavailable`, show that message as an informational note (not a red error); when `aiCapabilities.aiEnabled` is false, hide/disable the scan-receipt affordance with a short explanatory tooltip/caption. Keep plain file upload (attachment) working.
- [x] **Step 3:** PASS → `npx tsc --noEmit` clean → commit.

### Task 5: Natural-language invoicing fails soft

**Files:**
- Modify: `src/server/services/natural-language-invoice.ts:312-322` (`resolveInvoiceParserProvider` → return `null` keyless)
- Modify: `src/server/routers/invoices.ts:410` (the NL-draft procedure: short-circuit with a typed `unavailable` result, same contract style as Task 4)
- Modify: `src/components/invoices/InvoiceForm.tsx:385-411` (hide the "create from a prompt" box when `aiCapabilities.aiEnabled` is false; handle typed unavailable as info, not error toast)
- Test: extend NL-invoice service/router tests

- [ ] Steps mirror Task 4 exactly: failing tests → implement server short-circuit + client gating → PASS → commit.

### Task 6: Wire the dead `deterministicOnly` / `aiUnavailable` signal

**Files:**
- Modify: `src/server/services/invoice-draft-qa.ts` (~lines 420-590)
- Test: extend `src/test/**/invoice-draft-qa*` tests

- [ ] **Step 1:** Failing test: keyless (no `GEMINI_API_KEY`), `scanDraft`'s summary has `deterministicOnly: true` and `guardrails.aiUnavailable: true`; with a key and a successful AI check, both false.
- [ ] **Step 2:** Replace the hardcoded `hasPartial = false` (line 548): `checkUnclearDescriptions` (line ~430) should report whether the AI check actually ran (e.g. return `{ findings, ran: boolean }` or set a flag when it gates on the missing key / catches an error at lines 480-485); thread that into the summary/guardrails computation at lines 548-581. The client (`InvoiceDraftQA.tsx:97`) already renders the flag — verify no client change is needed.
- [ ] **Step 3:** PASS → run the full invoice-draft-qa + invoiceReview test files → green → commit.

### Task 7: Full verification

- [ ] `npm test -- --no-file-parallelism` (or targeted files if the sandbox blocks the full run: ai-availability, the modified router/service test files — note it for the coordinator).
- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] `npm run lint` → 0 errors.
- [ ] Commit anything pending; on sandbox `.git` failures leave staged + list exact `git add` commands; continue.
