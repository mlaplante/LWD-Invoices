# Conversational Report Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Natural-language report questions ("who paid late last quarter?", "top expense categories this year?") answered with grounded data — by extending the books assistant's tool registry with report-shaped tools and adding a compact "Ask about your numbers" panel to `/reports` that reuses the existing assistant backend.

**Architecture:** The books assistant (`src/server/services/books-assistant.ts`) is a bounded tool-calling loop (Gemini function-calling first, Anthropic fallback, `MAX_ITERATIONS = 6`) over org-scoped read-only tools sharing one JSON-Schema tool source (`TOOLS`, lines 80-151; implementations 186-369; `executeTool` dispatch; results capped via `limit` clamps at line ~377). We add three tools to that registry — payment-lateness history, expense summary, invoice statistics — so BOTH the `/assistant` page and the new `/reports` ask-panel gain the capability. No new AI plumbing, no new endpoint: the `/reports` panel calls the existing SSE route (`/api/assistant/stream`) with a report-focused seed. Read-only by design; grounding eval extended for the new tool shapes.

**Tech Stack:** existing books-assistant loop, `periodRange()` helper (`books-assistant.ts:155` — this/last month/quarter/year, last 30/90 days), Prisma aggregates, existing SSE client pattern from `src/components/dashboard/ChatAssistant.tsx:83-131`.

**Verified context (trust, don't re-derive):**
- Both providers consume the SAME tool definitions via `toGeminiSchema` (`books-assistant.ts:425-439`) — adding a tool means: one entry in `TOOLS`, one implementation, one `executeTool` case. No per-provider work.
- Assistant is stateless; client resends history (cap `MAX_HISTORY = 20`).
- Rate limiting: `askLimiter` 20/min per org in `src/server/routers/assistant.ts:13,37-42`; the SSE route has its own — verify and reuse; no new limiter needed.
- Grounding eval (`src/server/services/ai-eval/grounding.ts`, fixtures `assistant-grounding.fixtures.ts`) checks $-figures in canned answers against tool-result numbers; gate is minScore 1. Adding tool shapes = new fixture cases with fake tool results + hand-written answers.
- No expense tool exists at all today; "paid late" history is unanswerable today (no paidAt-vs-dueDate query).

**Hard constraints:**
- No schema/migration changes. No mutations — all new tools are read-only, org-scoped (`organizationId` from the authenticated context like every existing tool).
- Do not change existing tools, `SYSTEM_PROMPT` semantics beyond additive mention, `MAX_ITERATIONS`, or transport contracts (the `/assistant` page must behave exactly as before, plus new capabilities).
- Result caps: every new tool clamps limits to ≤50 rows like existing ones.

---

### Task 1: `get_payment_history` tool (lateness-aware)

**Files:**
- Modify: `src/server/services/books-assistant.ts` (TOOLS entry + implementation + executeTool case)
- Test: extend the books-assistant test file (grep `src/test/*books-assistant*` / `*assistant*` for the existing tool-implementation test pattern; if tools are tested via mocked db, mirror that)

Tool definition (JSON Schema mirroring existing entries):
- name: `get_payment_history`
- description: "Payments received in a period, with lateness vs the invoice due date. Use for questions about who paid late/on time, average days-to-pay, or payment history."
- params: `period` (same enum `periodRange` supports), optional `clientId`, optional `onlyLate` (boolean), optional `limit` (1-50, default 25).

Implementation:
```ts
// Payment.findMany where paidAt in periodRange(period), org-scoped,
// include invoice { number, dueDate, clientId, client { name } }
// per payment: daysLate = invoice.dueDate ? ceil((paidAt - dueDate)/86400000) : null (negative → early, clamp display at 0? NO — return raw, let model phrase it; but also provide paidLate: daysLate !== null && daysLate > 0)
// onlyLate → filter paidLate
// return { period, payments: [...limit rows: { client, invoiceNumber, amount, paidAt, dueDate, daysLate, paidLate }],
//          summary: { count, totalCollected, lateCount, averageDaysLate (over late ones, 1dp) } }
```

- [x] Failing test: two payments (one 10 days late, one on time) → summary lateCount 1, averageDaysLate 10, onlyLate filters; org-scoping asserted. → FAIL → implement → PASS → commit.

### Task 2: `get_expense_summary` tool

**Files:** same files as Task 1.

- name: `get_expense_summary`; description: "Expenses in a period grouped by category, with totals and top suppliers. Use for spending/expense questions."
- params: `period` (same enum), optional `limit` (1-50 default 25 — caps category rows).

```ts
// Expense.findMany org-scoped, date in periodRange(period), include category, supplier
// (check the actual Expense field names in prisma/schema.prisma — date field, amount, categoryId, supplierId — and use what exists)
// return { period, totalSpent, byCategory: [{ category, total, count } sorted desc, capped],
//          topSuppliers: [{ supplier, total } top 5] }
```

- [x] Failing test with 3 expenses across 2 categories → grouping/order/totals correct → implement → PASS → commit.

### Task 3: `get_invoice_stats` tool

**Files:** same files.

- name: `get_invoice_stats`; description: "Invoice issuance stats for a period: counts by status, total billed, average invoice value, largest invoices. Use for 'how much did I bill' questions (billed ≠ collected — get_revenue_summary is for collected cash)."
- params: `period`, optional `limit` (1-50 default 10 — caps largest-invoice rows).

```ts
// Invoice.findMany org-scoped, issueDate (or createdAt — use the field existing reports use for issuance; check reports.ts P&L/aging queries) in range, isArchived: false, exclude CREDIT_NOTE type from billed totals (credit notes negate — check how reports.ts treats invoice.type and mirror it)
// return { period, count, totalBilled, averageValue, byStatus: {DRAFT: n, SENT: n, ...},
//          largest: [{ number, client, total, status } capped] }
```

- [x] Failing test (mixed statuses + a credit note) asserting credit-note handling matches reports.ts convention → implement → PASS → commit.

### Task 4: System-prompt + eval coverage

**Files:**
- Modify: `src/server/services/books-assistant.ts` `SYSTEM_PROMPT` (lines 67-76): add one sentence noting report questions about payment lateness, expenses, and billing stats are answerable via tools; keep the "ONLY the data returned by tools" rule verbatim.
- Modify: `src/server/services/ai-eval/fixtures/assistant-grounding.fixtures.ts`

- [x] Add ≥6 grounding fixtures using the three new tool-result shapes: for each tool, one grounded answer (all $ figures present in the tool result) and one `critical: true` fabricated-figure case (`expected: { grounded: false }`). Follow the existing `AR_RESULT` fixture style (`assistant-grounding.fixtures.ts:17-24`).
- [x] `npm run test:eval` → all suites green (gate is perfect-score; if a fixture fails the checker rather than the intent, fix the fixture, never loosen `grounding.ts`). Commit.

### Task 5: "Ask about your numbers" panel on /reports

**Files:**
- Create: `src/components/reports/ReportsAskPanel.tsx`
- Modify: the `/reports` index page (locate `src/app/**/reports/page.tsx`) — render the panel above/beside the report cards, collapsed by default (an input + suggested-question chips; expands into a compact chat thread once asked)
- Test: only if a component-test pattern for chat exists; otherwise ensure any extracted pure helpers are tested

Behavior:
- Reuse the exact SSE + tRPC-fallback client logic from `ChatAssistant.tsx:83-131` — extract the shared streaming hook into `src/components/dashboard/useAssistantChat.ts` (or similar) and refactor `ChatAssistant.tsx` to use it rather than copy-pasting (~50 lines). `ChatAssistant`'s behavior must remain identical — same history cap, same fallback.
- Suggested chips: "Who paid late last quarter?", "Top expense categories this year", "How much did I bill last month vs collected?".
- Degradation: reuse the same unavailable handling the assistant already has (typed friendly message when keyless — comes free from the backend); when `aiCapabilities.aiEnabled` is false (query added by the ai-graceful-degradation plan), render nothing (the panel is hidden entirely).
- Empty/error states per house style: "Report builder unavailable" + retry on stream failure.

- [x] Implement → `npx tsc --noEmit` clean → manually confirm `/assistant` still compiles against the extracted hook → commit.

### Task 6: Full verification

- [ ] `npm test -- --no-file-parallelism`, `npm run test:eval`, `npx tsc --noEmit`, `npm run lint` — all clean (or targeted + note if sandbox-blocked).
- [ ] Commit pending; on sandbox git failure leave staged + exact `git add` lists; continue.
