# Client Reply Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inbound client email replies get AI-classified (promise-to-pay / dispute / question / info-update) with confidence + reasoning, surfaced as badges on the existing per-invoice replies panel, admin notifications for high-stakes categories, and a small review queue — with deterministic, server-derived suggested actions (the AI never free-texts an action).

**Architecture:** New 1:1 `InboundEmailTriage` model (additive migration). The inbound-email webhook fires a new `inbound-email/received` Inngest event after storing the row; a new Inngest function classifies via the established Gemini-first pattern (`callGeminiWithModelFallback` + `parseValidatedJson`) and writes the triage row. Low confidence (<0.6), schema-invalid output, or no AI key → category `NEEDS_REVIEW`, no notification, never an error. Suggested actions are a deterministic server-side map from category. UI: category badge + reasoning in `InboundRepliesPanel.tsx`, `notifyOrgAdmins` on DISPUTE / PROMISE_TO_PAY, and a `/replies` queue page. Eval-gated like reminder-guard.

**Tech Stack:** Prisma (additive), Inngest, `callGeminiWithModelFallback` (`src/server/services/gemini-fallback.ts:107`), `parseValidatedJson` (`src/server/services/ai-structured-output.ts`), `assertAiRateLimit` (`src/server/lib/ai-rate-limit.ts`), `notifyOrgAdmins` (`src/server/services/notifications.ts`), `getAiAvailability` (`src/server/services/ai-availability.ts` — added by the 2026-07-18 ai-graceful-degradation plan; it exists on main before this plan runs).

**Verified context (trust, don't re-derive):**
- Webhook: `src/app/api/webhooks/inbound-email/route.ts:16-134` (Resend/Svix). It resolves `invoiceId` from `reply+<invoiceId>@` recipients, threads into Tickets, and ALWAYS creates the `InboundEmail` row at lines ~119-131.
- `InboundEmail` model: `prisma/schema.prisma:1533-1557` — has `organizationId`, `invoiceId?`, `clientId?`, `ticketId?`, `bodyText?`, `fromEmail`, `messageId?`.
- Consumer today: `src/components/invoices/InboundRepliesPanel.tsx` via `trpc.invoices.inboundReplies` (invoice page).
- Inngest functions register in `src/app/api/inngest/route.ts:25-28`; event naming `<domain>/<action>`. Check `src/inngest/functions/CLAUDE.md` for house rules before writing the function.
- Eval harness: fixtures in `src/server/services/ai-eval/fixtures/*.fixtures.ts`, graders in `.../graders.ts` (pure, no model calls), runner gates via `suiteMeetsGate` (zero critical failures), CI test in `src/test/ai-eval/*.eval.test.ts`, run via `npm run test:eval`.
- Rate limiting: add a `replyTriage` entry to `src/server/lib/ai-rate-limit.ts` and call `assertAiRateLimit("replyTriage", orgId)`.

**Hard constraints:**
- Migration additive-only (new enum + new table; no changes to InboundEmail columns).
- The webhook's existing behavior must be untouched except one fire-and-forget `inngest.send` after the InboundEmail row is created — `.catch(() => {})`-guarded so a send failure can never fail the webhook (the "reply is never lost" invariant).
- Keyless orgs: no triage row is created (or NEEDS_REVIEW with `source: "skipped"` — see Task 3), zero errors, panel renders exactly as today when no triage exists.
- AI output is classification only. Suggested actions come from `SUGGESTED_ACTIONS[category]`, a hardcoded map.

---

### Task 1: Schema + migration

**Files:** Modify `prisma/schema.prisma`

- [x] **Step 1:** Add:

```prisma
enum TriageCategory {
  PROMISE_TO_PAY
  DISPUTE
  QUESTION
  INFO_UPDATE
  NEEDS_REVIEW
}

model InboundEmailTriage {
  id             String         @id @default(cuid())
  inboundEmailId String         @unique
  inboundEmail   InboundEmail   @relation(fields: [inboundEmailId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  category       TriageCategory
  confidence     Float
  reasoning      String
  promisedDate   DateTime? // extracted only for PROMISE_TO_PAY, best-effort
  source         String // "ai" | "fallback_low_confidence" | "fallback_invalid_output" | "skipped_no_ai"
  isDismissed    Boolean        @default(false)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([organizationId, isDismissed, createdAt])
}
```

Plus back-relations: `triage InboundEmailTriage?` on `InboundEmail`, `inboundEmailTriages InboundEmailTriage[]` on `Organization`.

- [x] **Step 2:** Create the migration the same way the payment-reconciliation plan describes (migrate dev if DB available, else `prisma migrate diff --from-migrations ... --script` into a new timestamped folder). Verify SQL is only CREATE TYPE / CREATE TABLE / CREATE INDEX / ALTER TABLE ADD (FK constraint adds are fine).
- [x] **Step 3:** `npx prisma generate` → commit.

### Task 2: Classifier service (pure logic first)

**Files:**
- Create: `src/server/services/reply-triage.ts`
- Test: `src/test/reply-triage.test.ts`

Contract:

```ts
import { z } from "zod";

export const triageOutputSchema = z.object({
  category: z.enum(["PROMISE_TO_PAY", "DISPUTE", "QUESTION", "INFO_UPDATE", "NEEDS_REVIEW"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(1000),
  promisedDate: z.string().nullable().optional(), // ISO date if the reply names a pay-by date
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;

export const MIN_CONFIDENCE = 0.6;

export const SUGGESTED_ACTIONS: Record<TriageOutput["category"], string> = {
  PROMISE_TO_PAY: "Note the promised date and consider pausing reminders until then.",
  DISPUTE: "Review the invoice and reply personally before any further reminders go out.",
  QUESTION: "Reply via the ticket thread — the question is waiting on you.",
  INFO_UPDATE: "Update the client's contact/payment details in their profile.",
  NEEDS_REVIEW: "Read the reply and categorize it yourself.",
};

// Pure guard: applied to whatever the model returned.
export function finalizeTriage(raw: unknown): {
  category: TriageOutput["category"];
  confidence: number;
  reasoning: string;
  promisedDate: Date | null;
  source: "ai" | "fallback_low_confidence" | "fallback_invalid_output";
} { /* parseValidatedJson-style safeParse; invalid → NEEDS_REVIEW/fallback_invalid_output;
       valid but confidence < MIN_CONFIDENCE → NEEDS_REVIEW/fallback_low_confidence, keep reasoning;
       promisedDate parsed with new Date(), invalid date → null;
       promisedDate only honored when category is PROMISE_TO_PAY. */ }

export async function classifyReply(input: {
  bodyText: string;
  subject: string | null;
  invoiceContext: { number: string; total: number; dueDate: Date | null; status: string } | null;
}): Promise<ReturnType<typeof finalizeTriage> | { skipped: true }> {
  // getAiAvailability().gemini false → { skipped: true } (Gemini-only for v1, matching invoice-review's pattern)
  // else build prompt, callGeminiWithModelFallback, finalizeTriage(parsed JSON)
  // any thrown provider error → finalizeTriage on invalid → NEEDS_REVIEW/fallback_invalid_output (never throw)
}
```

Prompt requirements: instruct JSON-only output matching the schema; truncate `bodyText` to ~4000 chars; include invoice number/total/due date as context; explicitly instruct "if the message is ambiguous, mixed, or automated (out-of-office), use NEEDS_REVIEW with low confidence".

- [ ] **Step 1:** Failing tests for `finalizeTriage`: valid high-confidence passthrough (`source: "ai"`); confidence 0.4 → NEEDS_REVIEW `fallback_low_confidence`; malformed JSON/wrong shape → NEEDS_REVIEW `fallback_invalid_output`; promisedDate ignored for non-PROMISE_TO_PAY; invalid date string → null. Mock-based test for `classifyReply`: no Gemini key → `{ skipped: true }`; provider throw → fallback_invalid_output.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS → commit.

### Task 3: Inngest function + webhook event

**Files:**
- Create: `src/inngest/functions/client-reply-triage.ts`
- Modify: `src/app/api/inngest/route.ts` (register)
- Modify: `src/app/api/webhooks/inbound-email/route.ts` (after the `db.inboundEmail.create` at ~119-131: `await inngest.send({ name: "inbound-email/received", data: { inboundEmailId, organizationId } }).catch(() => {})`)
- Modify: `src/server/lib/ai-rate-limit.ts` (add `replyTriage: createRateLimiter({ limit: 40, windowMs: 10 * 60_000 })`)
- Test: `src/test/inngest-client-reply-triage.test.ts` (mirror an existing inngest function test — grep `src/test/*inngest*` / `*automation*` for the pattern)

Function `id: "triage-inbound-reply"`, trigger `{ event: "inbound-email/received" }`:
1. Load InboundEmail with `invoice` (number,total,dueDate,status) and existing `triage`; if missing or already triaged → return (idempotent).
2. `assertAiRateLimit("replyTriage", organizationId)` — if it throws, return without retry-looping (catch and exit; a skipped triage is fine).
3. `classifyReply(...)`; if `{ skipped: true }` → create triage row with `category: NEEDS_REVIEW`, `confidence: 0`, `reasoning: "AI not configured"`, `source: "skipped_no_ai"`? — NO: per the keyless constraint, create NOTHING and return (panel then renders as today). Only create rows when AI actually ran (`source: "ai" | "fallback_*"`).
4. Create the `InboundEmailTriage` row.
5. If `source === "ai"` and category is `DISPUTE` or `PROMISE_TO_PAY`: `notifyOrgAdmins(organizationId, { type: <closest existing NotificationType — check the enum; reuse, don't extend>, title: "Client reply: dispute raised" / "Client reply: promise to pay", body: <fromEmail + invoice number + one-line reasoning>, link: "/invoices/<invoiceId>" (or "/replies" when no invoice) })`, `.catch(() => {})`.

- [x] Steps: failing tests (idempotency; keyless creates nothing; dispute notifies admins; fallback sources don't notify; rate-limit trip exits cleanly) → implement → PASS → commit.

### Task 4: tRPC router + panel badges + /replies page

**Files:**
- Create: `src/server/routers/replyTriage.ts`; register `replyTriage` in `src/server/routers/_app.ts`
- Modify: whichever procedure serves `trpc.invoices.inboundReplies` (include `triage` in the payload)
- Modify: `src/components/invoices/InboundRepliesPanel.tsx` (badge + expandable reasoning + suggested action line; renders identically to today when `triage` is null)
- Create: `src/app/(dashboard)/replies/page.tsx` + `src/components/replies/ReplyTriageList.tsx`
- Modify: `src/components/layout/SidebarNav.tsx` (add `/replies` near `/collections`)
- Test: `src/test/routers-reply-triage.test.ts`

Router:
- `list` — `protectedProcedure`, input `{ category?: TriageCategory[], includeDismissed?: boolean (default false), limit?: number (default 50) }`; org-scoped InboundEmailTriage rows newest-first, including `inboundEmail` (fromEmail, subject, receivedAt, invoiceId) and invoice number/client name via the inboundEmail relations.
- `dismiss` / `undismiss` — `requireRole("OWNER","ADMIN")`, toggles `isDismissed`; `logAudit` `.catch(() => {})`-wrapped (existing AuditAction values only).
- `recategorize` — `requireRole("OWNER","ADMIN")`, input `{ id, category: TriageCategory }`; sets category, `source: "manual"` (add `"manual"` to the allowed source strings), confidence 1, reasoning "Set manually"; audit-logged. This is the human-override the ai-ux doc requires.

UI:
- Badge colors by category (use existing badge component; e.g. DISPUTE red/destructive variant, PROMISE_TO_PAY green, QUESTION blue, INFO_UPDATE amber, NEEDS_REVIEW gray). Show `Math.round(confidence * 100)%` next to non-manual badges; tooltip/expand shows `reasoning` + `SUGGESTED_ACTIONS[category]`.
- `/replies` page: filter chips per category, dismissed toggle, each row links to its invoice; empty state "No replies to triage"; recategorize via a small select menu.

- [x] Steps: failing router tests (list org-scoping + filters; dismiss role-gating; recategorize sets manual/confidence 1) → implement router → panel/page UI → `npx tsc --noEmit` clean → PASS → commit.

### Task 5: Eval suite (gated)

**Files:**
- Create: `src/server/services/ai-eval/fixtures/reply-triage.fixtures.ts`
- Modify: `src/server/services/ai-eval/graders.ts` (add `gradeReplyTriage`)
- Create: `src/test/ai-eval/reply-triage.eval.test.ts`
- Modify: `src/test/ai-eval/suite-gates.eval.test.ts` if it enumerates suites (check and follow)

Fixtures are **raw model outputs + context → expected finalized triage** (graders are pure — they exercise `finalizeTriage`, no model calls, same as reminder-guard). Minimum 12 cases:
- Clear promise-to-pay with date → PROMISE_TO_PAY + promisedDate (critical: must not be DISPUTE).
- Explicit dispute ("this charge is wrong, I'm not paying") → DISPUTE, `critical: true` (a dispute misread as promise-to-pay is the dangerous failure).
- Dispute phrased politely → DISPUTE, `critical: true`.
- Question about line items → QUESTION.
- New billing address → INFO_UPDATE.
- Out-of-office auto-reply model output with high confidence QUESTION → grader expects whatever `finalizeTriage` yields (passthrough) — instead make this fixture a low-confidence output → NEEDS_REVIEW.
- Confidence 0.55 valid output → NEEDS_REVIEW `fallback_low_confidence`, `critical: true`.
- Malformed JSON → NEEDS_REVIEW `fallback_invalid_output`, `critical: true`.
- promisedDate on a QUESTION → stripped to null.
- Plus 3 more ordinary happy-path cases.

- [x] Steps: write fixtures + grader → `npm run test:eval` → all suites green (including pre-existing ones) → commit.

### Task 6: Full verification

- [ ] `npm test -- --no-file-parallelism`, `npm run test:eval`, `npx tsc --noEmit`, `npm run lint` — all clean (or targeted + note for coordinator if sandbox-blocked).
- [ ] Commit pending work; on sandbox git failure leave staged + exact `git add` lists; continue.
