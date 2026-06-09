# WS4 — Better Mobile Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface quick mobile actions — quick expense capture, start/stop timer, send reminder, and a fast "unpaid invoices" view — in the mobile navigation drawer, reusing the WS1 action primitives.

**Architecture:** `MobileNav.tsx` gains a row of action buttons in the slide-up drawer that open the WS1 primitives. A new lightweight mobile "Unpaid" view reuses `invoices.openForReminder` (WS1). UI wiring over WS1 — verified via `tsc` + manual; no new procedures beyond what WS1 added.

**Tech Stack:** `MobileNav.tsx` (client), WS1 `src/components/actions/*`, `invoices.openForReminder`.

**Prereq:** WS1 complete.

---

### Task 1: Add quick-action buttons to the mobile drawer

**Files:**
- Modify: `src/components/layout/MobileNav.tsx`
- Reference: `src/components/actions/index.ts`

- [ ] **Step 1: Import primitives + add action state**

At the top of `MobileNav`:

```tsx
import { QuickExpenseSheet, SendReminderInvoicePicker, StartTimerFlow } from "@/components/actions";
import { Wallet, Clock, Send } from "lucide-react"; // Wallet, Clock already imported — dedupe

type MobileAction = "expense" | "reminder" | "timer" | null;
const [action, setAction] = useState<MobileAction>(null);
```

(`useState` is already imported; `Wallet`, `Clock` are already in the icon import — only add `Send` if missing.)

- [ ] **Step 2: Add an "Quick actions" row in the drawer**

In the slide-up drawer, just below the "New Invoice CTA" block and above the secondary nav grid, add:

```tsx
<div className="px-4 grid grid-cols-3 gap-2 pb-3">
  <button onClick={() => { setDrawerOpen(false); setAction("expense"); }} className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40">
    <Wallet className="w-5 h-5" /><span className="text-[11px] font-semibold">Log expense</span>
  </button>
  <button onClick={() => { setDrawerOpen(false); setAction("timer"); }} className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40">
    <Clock className="w-5 h-5" /><span className="text-[11px] font-semibold">Start timer</span>
  </button>
  <button onClick={() => { setDrawerOpen(false); setAction("reminder"); }} className="flex flex-col items-center gap-2 py-4 rounded-2xl text-sidebar-foreground/70 active:bg-sidebar-accent/40">
    <Send className="w-5 h-5" /><span className="text-[11px] font-semibold">Send reminder</span>
  </button>
</div>
```

- [ ] **Step 3: Mount the primitives**

Just before the closing `</>` of the component's return:

```tsx
<QuickExpenseSheet open={action === "expense"} onOpenChange={(o) => !o && setAction(null)} />
<StartTimerFlow open={action === "timer"} onOpenChange={(o) => !o && setAction(null)} />
<SendReminderInvoicePicker open={action === "reminder"} onOpenChange={(o) => !o && setAction(null)} />
```

- [ ] **Step 4: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual (use `run` skill, mobile viewport): open the More drawer → the three quick actions appear and open their sheets; each completes and closes the drawer.

```bash
git add src/components/layout/MobileNav.tsx
git commit -m "feat(mobile): quick actions in nav drawer (expense, timer, reminder)"
```

---

### Task 2: Mobile "Unpaid invoices" quick view

A fast list of open/overdue invoices reachable from the drawer.

**Files:**
- Create: `src/app/(dashboard)/invoices/unpaid/page.tsx`
- Modify: `src/components/layout/MobileNav.tsx` (add a "Unpaid" entry to `moreItems`)

- [ ] **Step 1: Add the page**

```tsx
"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";

export default function UnpaidInvoicesPage() {
  const { data, isLoading } = trpc.invoices.openForReminder.useQuery({});
  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl tracking-tight">Unpaid invoices</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing outstanding. 🎉</p>}
      <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card">
        {data?.map((inv) => (
          <li key={inv.id}>
            <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-accent">
              <span className="truncate text-sm font-medium">{inv.number} — {inv.clientName}</span>
              <span className="text-sm tabular-nums">{inv.total.toFixed(2)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> Note: format `inv.total` with the org's currency formatter if one exists (grep for a `formatCurrency`/`formatMoney` helper in `src/lib`); fall back to `toFixed(2)` only if none is found.

- [ ] **Step 2: Add a drawer link**

In `MobileNav.tsx` `moreItems`, add: `{ href: "/invoices/unpaid", label: "Unpaid", icon: Receipt }` (import `Receipt` if not present).

- [ ] **Step 3: Typecheck + verify + commit**

Run: `npx tsc --noEmit`
Manual: open `/invoices/unpaid` on mobile → lists open/overdue invoices, each links to its detail.

```bash
git add src/app/\(dashboard\)/invoices/unpaid/page.tsx src/components/layout/MobileNav.tsx
git commit -m "feat(mobile): unpaid-invoices quick view"
```

---

### Task 3: Workstream verification

- [ ] **Step 1:** `npx tsc --noEmit && npm test` — clean, all pass.
- [ ] **Step 2:** Manual (use `verify` skill, mobile viewport): drive expense/timer/reminder from the drawer and open the unpaid view end to end.

---

## Self-review notes
- **Spec coverage (WS4):** quick expense ✅, start/stop timer ✅ (StartTimerFlow surfaces a running timer; stop happens on the task page/timesheets), send reminder ✅, view unpaid ✅.
- **Verify-during-wiring:** currency formatter helper; whether `Send`/`Receipt` icons are already imported in `MobileNav`.
- **Type consistency:** `MobileAction` union ↔ the three `action ===` checks. Reuses `invoices.openForReminder` exactly as defined in WS1 (returns `{ id, number, clientName, total, status, dueDate }`).
