# AI Features — Plan 3: Collections Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ranked daily collections queue — who to chase, suggested tone, risk explanation, one-click send — as a thin layer over the existing collections stack.

**Architecture:** The risk score, draft, and send already exist (`collection-risk.ts`, `collections.draftReminder`, `collections.sendReminder`). This plan adds only (1) a pure `rankCollectionsQueue` deterministic ordering function, (2) a `collections.queue` tRPC query that loads org-scoped open invoices, assembles each `CollectionRiskInput`, scores with the existing `scoreCollectionRisk`, ranks, and returns queue rows, and (3) a `/collections` daily-queue page that reuses the existing draft/send mutations. No drafting or sending logic is rebuilt.

**Tech Stack:** Next.js 16, tRPC, Prisma, Vitest, the existing `collection-risk.ts` + `collections.ts` router + `client-payment-score.ts`.

**Depends on:** nothing new (no AI provider work — ranking is deterministic). Independent of Plans 1/2.

---

## File Structure

- Modify: `src/server/services/collection-risk.ts` — add the pure `rankCollectionsQueue(scores)` ordering.
- Modify: `src/server/routers/collections.ts` — add the `queue` query (assembles inputs, scores, ranks).
- Create: `src/app/(dashboard)/collections/page.tsx` — the daily-queue route.
- Create: `src/components/collections/CollectionsQueue.tsx` — the ranked list + per-row draft/send.
- Modify: `src/components/layout/SidebarNav.tsx` and `src/components/layout/MobileNav.tsx` — add a "Collections" nav entry.
- Create: `src/test/collections-queue.test.ts` — unit tests for `rankCollectionsQueue`.
- Create: `src/server/services/ai-eval/fixtures/collections-queue.fixtures.ts` — ranking determinism golden cases.
- Modify: `src/server/services/ai-eval/graders.ts` — add `gradeCollectionsQueue`.
- Modify: `src/server/services/ai-eval/index.ts` — register suite + re-exports.
- Create: `src/test/ai-eval/collections-queue.eval.test.ts`.

---

## Task 1: Pure ranking function

**Files:**
- Modify: `src/server/services/collection-risk.ts`
- Test: `src/test/collections-queue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { rankCollectionsQueue, type CollectionRiskScore } from "@/server/services/collection-risk";

function score(overrides: Partial<CollectionRiskScore>): CollectionRiskScore {
  return {
    invoiceId: "i",
    invoiceNumber: "INV",
    clientId: "c",
    clientName: "Client",
    balance: 100,
    daysOverdue: 0,
    lateRiskPercent: 0,
    band: "low",
    recommendedAction: "monitor",
    recommendedTone: "helpful",
    actionDue: false,
    daysSinceLastReminder: null,
    reasons: [],
    ...overrides,
  };
}

describe("rankCollectionsQueue", () => {
  it("puts action-due invoices ahead of monitor-only ones", () => {
    const ranked = rankCollectionsQueue([
      score({ invoiceId: "monitor", actionDue: false, lateRiskPercent: 90, balance: 9999 }),
      score({ invoiceId: "due", actionDue: true, lateRiskPercent: 10, balance: 10 }),
    ]);
    expect(ranked[0].invoiceId).toBe("due");
  });

  it("orders action-due invoices by risk-weighted exposure (lateRisk% × balance)", () => {
    const ranked = rankCollectionsQueue([
      score({ invoiceId: "small", actionDue: true, lateRiskPercent: 80, balance: 100 }), // 8000
      score({ invoiceId: "big", actionDue: true, lateRiskPercent: 50, balance: 1000 }), // 50000
    ]);
    expect(ranked.map((r) => r.invoiceId)).toEqual(["big", "small"]);
  });

  it("is deterministic and stable for equal exposure (tie-breaks by invoiceId)", () => {
    const a = score({ invoiceId: "a", actionDue: true, lateRiskPercent: 50, balance: 100 });
    const b = score({ invoiceId: "b", actionDue: true, lateRiskPercent: 50, balance: 100 });
    expect(rankCollectionsQueue([b, a]).map((r) => r.invoiceId)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/collections-queue.test.ts`
Expected: FAIL — `rankCollectionsQueue` not exported.

- [ ] **Step 3: Write the minimal implementation (append to `collection-risk.ts`)**

```ts
/**
 * Deterministic daily-queue ordering over already-computed risk scores.
 * Action-due invoices first; within each group, by risk-weighted exposure
 * (lateRiskPercent × balance) descending; ties broken by invoiceId so the
 * order is stable and reproducible (the ranking is explainable, never an LLM).
 */
export function rankCollectionsQueue(scores: CollectionRiskScore[]): CollectionRiskScore[] {
  const exposure = (s: CollectionRiskScore) => s.lateRiskPercent * s.balance;
  return [...scores].sort((a, b) => {
    if (a.actionDue !== b.actionDue) return a.actionDue ? -1 : 1;
    const diff = exposure(b) - exposure(a);
    if (diff !== 0) return diff;
    return a.invoiceId.localeCompare(b.invoiceId);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/collections-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/collection-risk.ts src/test/collections-queue.test.ts
git commit -m "feat(collections): deterministic daily-queue ranking"
```

---

## Task 2: `collections.queue` tRPC query

**Files:** Modify `src/server/routers/collections.ts`

- [ ] **Step 1: Confirm the inputs the existing score needs**

Run: `grep -nE "CollectionRiskInput|scoreCollectionRisk|getClientPaymentBehaviorSummary|smartRemindersThreshold|remindersSent|invoiceOpened" src/server/services/collection-risk.ts src/server/services/client-payment-score.ts`
Expected: confirms `scoreCollectionRisk(input: CollectionRiskInput): CollectionRiskScore` and the payment-behavior summary shape. The `CollectionRiskInput` fields are: `invoiceId, invoiceNumber, clientId, clientName, balance, daysUntilDue, clientOnTimePercent, clientAvgDaysLate, isReliablePayer, remindersSent, daysSinceLastReminder, invoiceOpened, invoiceClicked`.

- [ ] **Step 2: Add the query** (append to `collectionsRouter`)

```ts
  /**
   * Ranked daily collections queue for the org. Loads open/overdue invoices,
   * assembles each CollectionRiskInput, scores them with the existing
   * scoreCollectionRisk, and orders them with rankCollectionsQueue. Read-only;
   * every query is scoped to ctx.orgId. Drafting/sending stay in draftReminder/
   * sendReminder — the UI calls those per row.
   */
  queue: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const org = await ctx.db.organization.findUnique({
        where: { id: ctx.orgId },
        select: { smartRemindersThreshold: true },
      });

      // Open, non-archived invoices with a balance owing and a due date.
      const invoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isArchived: false,
          dueDate: { not: null },
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
        },
        select: {
          id: true,
          number: true,
          total: true,
          dueDate: true,
          clientId: true,
          client: { select: { id: true, name: true } },
          partialPayments: { select: { amount: true } },
          manualReminders: { select: { createdAt: true } },
          reminderLogs: { select: { createdAt: true } },
          emailEvents: { select: { type: true } },
        },
        take: 500,
      });

      const now = Date.now();
      const dayMs = 86400000;

      const scores = await Promise.all(
        invoices.map(async (inv) => {
          const paid = inv.partialPayments.reduce((sum, p) => sum + Number(p.amount), 0);
          const balance = Number(inv.total) - paid;
          if (balance <= 0) return null;

          const behavior = await getClientPaymentBehaviorSummary(ctx.db, inv.clientId);
          const reminderDates = [
            ...inv.manualReminders.map((r) => r.createdAt.getTime()),
            ...inv.reminderLogs.map((r) => r.createdAt.getTime()),
          ];
          const lastReminder = reminderDates.length ? Math.max(...reminderDates) : null;
          const dueMs = inv.dueDate!.getTime();
          const eventTypes = inv.emailEvents.map((e) => e.type);

          return scoreCollectionRisk({
            invoiceId: inv.id,
            invoiceNumber: inv.number,
            clientId: inv.client.id,
            clientName: inv.client.name,
            balance,
            daysUntilDue: Math.round((dueMs - now) / dayMs),
            clientOnTimePercent: behavior.onTimePercent,
            clientAvgDaysLate: 0, // see implementer note
            isReliablePayer:
              behavior.onTimePercent !== null &&
              behavior.onTimePercent >= (org?.smartRemindersThreshold ?? 80),
            remindersSent: reminderDates.length,
            daysSinceLastReminder: lastReminder === null ? null : Math.round((now - lastReminder) / dayMs),
            invoiceOpened: eventTypes.includes("opened"),
            invoiceClicked: eventTypes.includes("clicked"),
          });
        }),
      );

      const ranked = rankCollectionsQueue(scores.filter((s): s is NonNullable<typeof s> => s !== null));
      return { queue: ranked.slice(0, limit) };
    }),
```

- [ ] **Step 3: Add the imports at the top of `collections.ts`**

```ts
import { InvoiceStatus } from "@/generated/prisma";
import { scoreCollectionRisk, rankCollectionsQueue } from "@/server/services/collection-risk";
```

> **Implementer notes (resolve with grep, do not guess):**
> - `clientAvgDaysLate`: the summary in `client-payment-score.ts` returns `{ paidInvoiceCount, onTimePercent, lateInvoiceCount }` — it does NOT include average days late. Either (a) pass `0` (acceptable: the score weights it only when > 0) or (b) extend `getClientPaymentBehaviorSummary` to also return `avgDaysLate`. Prefer (a) for this plan to avoid scope creep; note it in the PR. Run `grep -n "avgDaysLate\|clientAvgDaysLate" src/server/services` to confirm before deciding.
> - `emailEvents` `type` values: confirm the exact string values (`"opened"`, `"clicked"`) via `grep -n "opened\|clicked\|EmailEvent" prisma/schema.prisma src/server/services/*.ts`. Match them exactly.
> - `InvoiceStatus` enum members (`SENT`/`PARTIAL`/`OVERDUE`): confirm via `grep -nA8 "enum InvoiceStatus" prisma/schema.prisma` and use the real members.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (fix any field-name mismatches against the real schema).

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/collections.ts
git commit -m "feat(collections): ranked daily-queue tRPC query"
```

---

## Task 3: Ranking-determinism eval suite

**Files:**
- Create: `src/server/services/ai-eval/fixtures/collections-queue.fixtures.ts`
- Modify: `src/server/services/ai-eval/graders.ts`
- Modify: `src/server/services/ai-eval/index.ts`
- Create: `src/test/ai-eval/collections-queue.eval.test.ts`

- [ ] **Step 1: Write the grader (append to `graders.ts`)**

```ts
import { rankCollectionsQueue, type CollectionRiskScore } from "../collection-risk";

export interface CollectionsQueueInput {
  scores: CollectionRiskScore[];
}

export interface CollectionsQueueExpected {
  /** The invoiceIds in the exact order the queue must produce. */
  order: string[];
}

export const gradeCollectionsQueue: Grader<CollectionsQueueInput, CollectionsQueueExpected> = (
  input,
  expected,
) => {
  const got = rankCollectionsQueue(input.scores).map((s) => s.invoiceId);
  const ok = got.length === expected.order.length && got.every((id, i) => id === expected.order[i]);
  return ok
    ? { score: 1 }
    : { score: 0, detail: `order got [${got.join(",")}] want [${expected.order.join(",")}]` };
};
```

- [ ] **Step 2: Write the fixtures**

```ts
import type { EvalCase } from "../types";
import type { CollectionsQueueInput, CollectionsQueueExpected } from "../graders";
import type { CollectionRiskScore } from "../../collection-risk";

function score(o: Partial<CollectionRiskScore>): CollectionRiskScore {
  return {
    invoiceId: "i",
    invoiceNumber: "INV",
    clientId: "c",
    clientName: "Client",
    balance: 100,
    daysOverdue: 0,
    lateRiskPercent: 0,
    band: "low",
    recommendedAction: "monitor",
    recommendedTone: "helpful",
    actionDue: false,
    daysSinceLastReminder: null,
    reasons: [],
    ...o,
  };
}

export const collectionsQueueCases: EvalCase<CollectionsQueueInput, CollectionsQueueExpected>[] = [
  {
    id: "action-due-first",
    description: "CRITICAL: action-due invoices always outrank monitor-only ones",
    critical: true,
    input: {
      scores: [
        score({ invoiceId: "monitor", actionDue: false, lateRiskPercent: 99, balance: 99999 }),
        score({ invoiceId: "due", actionDue: true, lateRiskPercent: 1, balance: 1 }),
      ],
    },
    expected: { order: ["due", "monitor"] },
  },
  {
    id: "exposure-order",
    description: "within action-due, higher lateRisk×balance ranks first",
    input: {
      scores: [
        score({ invoiceId: "small", actionDue: true, lateRiskPercent: 80, balance: 100 }),
        score({ invoiceId: "big", actionDue: true, lateRiskPercent: 50, balance: 1000 }),
      ],
    },
    expected: { order: ["big", "small"] },
  },
  {
    id: "stable-tiebreak",
    description: "equal exposure ties break by invoiceId for reproducibility",
    input: {
      scores: [
        score({ invoiceId: "b", actionDue: true, lateRiskPercent: 50, balance: 100 }),
        score({ invoiceId: "a", actionDue: true, lateRiskPercent: 50, balance: 100 }),
      ],
    },
    expected: { order: ["a", "b"] },
  },
];
```

- [ ] **Step 3: Register the suite in `index.ts`**

Add imports:

```ts
import { gradeCollectionsQueue } from "./graders";
import { collectionsQueueCases } from "./fixtures/collections-queue.fixtures";
```

Add to the `suites` array:

```ts
    {
      // Queue ordering must be deterministic and explainable — no LLM ranking.
      report: runSuite("collections-queue", collectionsQueueCases, gradeCollectionsQueue),
      gate: { minScore: 1, minPassRate: 1 },
    },
```

Add to the re-export block:

```ts
  gradeCollectionsQueue,
  type CollectionsQueueInput,
  type CollectionsQueueExpected,
```

- [ ] **Step 4: Write the CI gate test**

```ts
import { describe, it, expect } from "vitest";
import { gradeCollectionsQueue } from "@/server/services/ai-eval";
import { collectionsQueueCases } from "@/server/services/ai-eval/fixtures/collections-queue.fixtures";

describe("golden: collections queue ranking", () => {
  it.each(collectionsQueueCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const { score, detail } = gradeCollectionsQueue(testCase.input, testCase.expected);
    expect(score, detail ?? testCase.description).toBe(1);
  });
});
```

- [ ] **Step 5: Run the eval suite**

Run: `npx vitest run src/test/ai-eval/collections-queue.eval.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ai-eval/ src/test/ai-eval/collections-queue.eval.test.ts
git commit -m "test(collections): golden-set ranking-determinism suite"
```

---

## Task 4: Daily-queue UI

**Files:**
- Create: `src/components/collections/CollectionsQueue.tsx`
- Create: `src/app/(dashboard)/collections/page.tsx`

- [ ] **Step 1: Inspect an existing dashboard page + the draft/send mutation usage**

Run: `cat "src/app/(dashboard)/month-end-close/page.tsx"` and `grep -rn "draftReminder\|sendReminder" src/components | head`
Expected: shows the page wrapper pattern (server component rendering a client component) and any existing draft/send usage to mirror.

- [ ] **Step 2: Write the queue component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

const BAND_STYLES: Record<string, string> = {
  severe: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  moderate: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
};

export function CollectionsQueue() {
  const { data, isLoading } = trpc.collections.queue.useQuery({ limit: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string; tone?: string; source?: string } | null>(null);

  const draftReminder = trpc.collections.draftReminder.useMutation({
    onSuccess: (d) => setDraft({ subject: d.subject, body: d.body, tone: d.tone, source: d.source }),
    onError: (e) => toast.error(e.message),
  });
  const sendReminder = trpc.collections.sendReminder.useMutation({
    onSuccess: (r) => {
      toast[r.sent ? "success" : "warning"](r.sent ? "Reminder sent" : `Not sent: ${"reason" in r ? r.reason : "suppressed"}`);
      setOpenId(null);
      setDraft(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading queue…</p>;
  if (!data || data.queue.length === 0) return <p className="text-sm text-gray-500">Nothing to chase today. 🎉</p>;

  return (
    <ul className="divide-y rounded-md border">
      {data.queue.map((row) => (
        <li key={row.invoiceId} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.clientName}</span>
                <span className="text-sm text-gray-500">{row.invoiceNumber}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${BAND_STYLES[row.band] ?? BAND_STYLES.low}`}>
                  {row.band} · {row.lateRiskPercent}%
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                ${row.balance.toFixed(2)} · {row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : "due soon"} ·
                suggested tone: <strong>{row.recommendedTone}</strong>
              </p>
              {row.reasons.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">{row.reasons.join(" · ")}</p>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              onClick={() => {
                setOpenId(row.invoiceId);
                setDraft(null);
                draftReminder.mutate({ invoiceId: row.invoiceId });
              }}
            >
              Chase
            </button>
          </div>

          {openId === row.invoiceId && draft && (
            <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
              <textarea
                className="h-40 w-full rounded border px-2 py-1 text-sm"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded px-3 py-1.5 text-sm" onClick={() => setOpenId(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
                  disabled={sendReminder.isPending}
                  onClick={() =>
                    sendReminder.mutate({
                      invoiceId: row.invoiceId,
                      subject: draft.subject,
                      body: draft.body,
                      tone: draft.tone as "helpful" | "professional" | "firm" | undefined,
                      source: draft.source as "ai" | "template_fallback" | undefined,
                    })
                  }
                >
                  {sendReminder.isPending ? "Sending…" : "Send reminder"}
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
import { CollectionsQueue } from "@/components/collections/CollectionsQueue";

export default function CollectionsPage() {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Collections</h1>
        <p className="text-sm text-gray-500">Your ranked daily queue — highest-risk receivables first.</p>
      </div>
      <CollectionsQueue />
    </div>
  );
}
```

> **Implementer note:** match the page wrapper/auth pattern of the neighbouring `month-end-close/page.tsx` (it may wrap in a layout/guard). Mirror it rather than the bare wrapper above if that's the convention.

- [ ] **Step 4: Add the nav entry**

In `src/components/layout/SidebarNav.tsx` (and `MobileNav.tsx`), add a "Collections" item pointing at `/collections`, mirroring the existing entries' shape (icon + label + href). Run `grep -n "href=\"/month-end-close\"\|disputes\|Disputes" src/components/layout/SidebarNav.tsx` first to copy the exact item structure.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/collections/CollectionsQueue.tsx "src/app/(dashboard)/collections/page.tsx"`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/collections" src/components/collections src/components/layout/SidebarNav.tsx src/components/layout/MobileNav.tsx
git commit -m "feat(collections): ranked daily-queue page with one-click chase"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all green incl. the `collections-queue` golden suite.

---

## Self-Review (completed by plan author)

- **Spec coverage:** ranked daily queue (`collections.queue` + `rankCollectionsQueue`), who to chase + risk explanation (`reasons`, `band`, `lateRiskPercent`), suggested tone (`recommendedTone`), one-click send (reuses existing `draftReminder`/`sendReminder` — nothing rebuilt). Ranking is deterministic with a golden determinism suite. Cross-tenant isolation via `ctx.orgId` on every query.
- **Type consistency:** `CollectionRiskScore` is the single shared shape across `rankCollectionsQueue`, the query, the grader, and the UI. Tone literals `"helpful" | "professional" | "firm"` match `sendReminder`'s input enum.
- **Open items left to implementer (with grep, not placeholders):** `clientAvgDaysLate` source (pass 0 vs extend the summary), `EmailEvent.type` string values, `InvoiceStatus` enum members, the dashboard page wrapper convention, and the nav-item structure.
