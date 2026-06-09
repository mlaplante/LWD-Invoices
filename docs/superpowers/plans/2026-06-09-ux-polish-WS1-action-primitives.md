# WS1 — Shared Action Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build four headless, controlled action components (`QuickExpenseSheet`, `SendReminderInvoicePicker`, `StartTimerFlow`, `GenerateReportMenu`) plus one supporting query (`invoices.openForReminder`), so WS3 (command palette) and WS4 (mobile) can both invoke the same actions.

**Architecture:** Each primitive is a controlled component `{ open, onOpenChange, onCompleted? }` under `src/components/actions/`. They reuse existing procedures (`expenses.create`, `collections.draftReminder`/`sendReminder` via the existing `CollectionsReminderDialog`, `timers.start`). Only one new procedure is added — `invoices.openForReminder` — and it is the single TDD'd unit (UI is verified via `tsc` + manual per the INDEX's testing note).

**Tech Stack:** Next.js 16, tRPC v11, Zod 4, shadcn/ui (Dialog/Sheet), `cmdk`, `sonner`, `lucide-react`.

---

### Task 1: `invoices.openForReminder` query

The reminder picker and the mobile "unpaid invoices" view both need a lightweight list of open/overdue invoices, optionally filtered by a search term, without over-fetching invoice relations.

**Files:**
- Modify: `src/server/routers/invoices.ts` (add procedure to the existing router object)
- Test: `src/test/routers-invoices-open-for-reminder.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { invoicesRouter } from "@/server/routers/invoices";
import { createMockContext } from "./mocks/trpc-context";

describe("invoices.openForReminder", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let caller: ReturnType<typeof invoicesRouter.createCaller>;

  beforeEach(() => {
    ctx = createMockContext();
    caller = invoicesRouter.createCaller(ctx);
  });

  it("queries only open/overdue invoices scoped to the org, newest first", async () => {
    ctx.db.invoice.findMany.mockResolvedValue([
      { id: "inv_1", number: "INV-001", status: "OVERDUE", total: 100, dueDate: new Date("2026-05-01"), client: { id: "c1", name: "Acme" } },
    ]);

    const result = await caller.openForReminder({});

    expect(ctx.db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "test-org-123",
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        }),
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
    );
    expect(result[0]).toMatchObject({ id: "inv_1", number: "INV-001", clientName: "Acme" });
  });

  it("adds a case-insensitive number/client search when q is provided", async () => {
    ctx.db.invoice.findMany.mockResolvedValue([]);
    await caller.openForReminder({ q: "acme" });
    const arg = ctx.db.invoice.findMany.mock.calls[0][0];
    expect(JSON.stringify(arg.where)).toContain("acme");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/routers-invoices-open-for-reminder.test.ts`
Expected: FAIL — `caller.openForReminder is not a function`.

- [ ] **Step 3: Add the procedure**

Add to the `invoicesRouter` object in `src/server/routers/invoices.ts` (alongside other procedures). Confirm `InvoiceStatus` is imported (it is used elsewhere in the file — reuse the existing import; otherwise `import { InvoiceStatus } from "@/generated/prisma"`).

```ts
  openForReminder: protectedProcedure
    .input(z.object({ q: z.string().trim().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          ...(input.q
            ? {
                OR: [
                  { number: { contains: input.q, mode: "insensitive" } },
                  { client: { is: { name: { contains: input.q, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          dueDate: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      });
      return rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        total: Number(r.total),
        dueDate: r.dueDate,
        clientName: r.client?.name ?? "—",
      }));
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/routers-invoices-open-for-reminder.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/server/routers/invoices.ts src/test/routers-invoices-open-for-reminder.test.ts
git commit -m "feat(invoices): openForReminder query for action primitives"
```

---

### Task 2: `<QuickExpenseSheet>` primitive

A minimal log-expense form in a shadcn Sheet/Dialog. UI-only (no new procedure) — verified via tsc + manual.

**Files:**
- Create: `src/components/actions/QuickExpenseSheet.tsx`

- [ ] **Step 1: Build the component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface ActionPrimitiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

/**
 * Minimal log-expense action. Requires OWNER/ADMIN/ACCOUNTANT (enforced
 * server-side by expenses.create); a 403 surfaces as a toast.
 */
export function QuickExpenseSheet({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Expense logged");
      void utils.expenses.list?.invalidate?.();
      setName("");
      setRate("");
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  function submit() {
    const amount = Number(rate);
    if (!name.trim() || Number.isNaN(amount)) {
      toast.error("Enter a name and amount");
      return;
    }
    create.mutate({ name: name.trim(), rate: amount, qty: 1 });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qe-name">Description</Label>
            <Input id="qe-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AWS bill" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qe-rate">Amount</Label>
            <Input id="qe-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? "Saving…" : "Log expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: if `expenses.list` is a paginated/infinite query whose `invalidate` signature differs, the optional-chaining guard above is intentional — it no-ops rather than throwing. Adjust to the real invalidation target during wiring if needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/actions/QuickExpenseSheet.tsx
git commit -m "feat(actions): QuickExpenseSheet primitive"
```

---

### Task 3: `<SendReminderInvoicePicker>` primitive

Searchable open-invoice picker that, on selection, hands `invoiceId` to the **existing** `CollectionsReminderDialog`.

**Files:**
- Create: `src/components/actions/SendReminderInvoicePicker.tsx`
- Reference: `src/components/reports/CollectionsReminderDialog.tsx` (props `{ invoiceId, invoiceNumber?, onClose }`)

- [ ] **Step 1: Build the component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollectionsReminderDialog } from "@/components/reports/CollectionsReminderDialog";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

export function SendReminderInvoicePicker({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; number: string } | null>(null);
  const { data } = trpc.invoices.openForReminder.useQuery({ q: q || undefined }, { enabled: open });

  return (
    <>
      <Dialog open={open && !picked} onOpenChange={(o) => { if (!o) { setQ(""); onOpenChange(false); } }}>
        <DialogContent className="p-0 overflow-hidden max-w-lg">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Send reminder — choose invoice</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <Command.Input value={q} onValueChange={setQ} placeholder="Search open invoices…" className="h-11 w-full border-b px-4 text-sm outline-none bg-transparent" />
            <Command.List className="max-h-72 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No open invoices.</Command.Empty>
              {data?.map((inv) => (
                <Command.Item
                  key={inv.id}
                  value={inv.id}
                  onSelect={() => setPicked({ id: inv.id, number: inv.number })}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent"
                >
                  <span className="truncate">{inv.number} — {inv.clientName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{inv.status.toLowerCase()}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>

      <CollectionsReminderDialog
        invoiceId={picked?.id ?? null}
        invoiceNumber={picked?.number}
        onClose={() => {
          setPicked(null);
          setQ("");
          onOpenChange(false);
          onCompleted?.();
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (If `CollectionsReminderDialog`'s prop names differ from `{ invoiceId, invoiceNumber, onClose }`, fix the call to match its actual signature — see the reference file.)

- [ ] **Step 3: Commit**

```bash
git add src/components/actions/SendReminderInvoicePicker.tsx
git commit -m "feat(actions): SendReminderInvoicePicker reusing CollectionsReminderDialog"
```

---

### Task 4: `<StartTimerFlow>` primitive

Project → Task picker → `timers.start({ taskId })`. There is no task-less timer, so the picker is mandatory.

**Files:**
- Create: `src/components/actions/StartTimerFlow.tsx`
- Reference: `src/server/routers/timers.ts` (`start({ taskId })`, `getUserTimers`), `projects.list`, `tasks.list({ projectId })`

- [ ] **Step 1: Build the component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

export function StartTimerFlow({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [projectId, setProjectId] = useState<string>("");
  const projects = trpc.projects.list.useQuery(undefined, { enabled: open });
  const tasks = trpc.tasks.list.useQuery({ projectId }, { enabled: open && !!projectId });
  const utils = trpc.useUtils();

  const start = trpc.timers.start.useMutation({
    onSuccess: () => {
      toast.success("Timer started");
      void utils.timers.getUserTimers.invalidate();
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Start timer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="st-project">Project</Label>
            <select id="st-project" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.data?.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {projectId && (
            <div className="space-y-1.5">
              <Label>Task</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {tasks.data?.map((t: { id: string; name: string }) => (
                  <Button key={t.id} variant="outline" className="w-full justify-start" disabled={start.isPending} onClick={() => start.mutate({ taskId: t.id })}>
                    {t.name}
                  </Button>
                ))}
                {tasks.data?.length === 0 && <p className="text-sm text-muted-foreground">No tasks in this project.</p>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: confirm `projects.list` takes no input (the router shows `list:` — verify its input signature; pass `undefined` if input-less, or `{}` if it requires an object). Adjust the `useQuery` arg and the project item type to match the real return shape during wiring.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/actions/StartTimerFlow.tsx
git commit -m "feat(actions): StartTimerFlow with mandatory task picker"
```

---

### Task 5: `<GenerateReportMenu>` primitive

A list of report destinations that navigates (export lives on the report pages).

**Files:**
- Create: `src/components/actions/GenerateReportMenu.tsx`

- [ ] **Step 1: Build the component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3 } from "lucide-react";
import type { ActionPrimitiveProps } from "./QuickExpenseSheet";

const REPORTS = [
  { label: "Revenue report", href: "/reports" },
  { label: "Unpaid invoices", href: "/reports?type=unpaid" },
  { label: "Expense ledger", href: "/reports?type=expenses" },
  { label: "AR aging", href: "/reports?type=aging" },
  { label: "Year-end pack", href: "/reports?type=year-end" },
];

export function GenerateReportMenu({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-md">
        <DialogHeader className="px-4 pt-4"><DialogTitle>Generate report</DialogTitle></DialogHeader>
        <Command>
          <Command.List className="max-h-72 overflow-y-auto p-2">
            {REPORTS.map((r) => (
              <Command.Item key={r.href} value={r.label} onSelect={() => { onOpenChange(false); onCompleted?.(); router.push(r.href); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />{r.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: confirm the `/reports` query-param routes exist. If the reports page does not read a `?type=` param, either (a) point each entry at the real sub-route, or (b) add a small `type` reader to the reports page in this task. Verify before finalizing the hrefs.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/actions/GenerateReportMenu.tsx
git commit -m "feat(actions): GenerateReportMenu navigation primitive"
```

---

### Task 6: Barrel export + workstream verification

**Files:**
- Create: `src/components/actions/index.ts`

- [ ] **Step 1: Add barrel**

```ts
export { QuickExpenseSheet, type ActionPrimitiveProps } from "./QuickExpenseSheet";
export { SendReminderInvoicePicker } from "./SendReminderInvoicePicker";
export { StartTimerFlow } from "./StartTimerFlow";
export { GenerateReportMenu } from "./GenerateReportMenu";
```

- [ ] **Step 2: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all tests pass (existing 127 files + new `openForReminder` test).

- [ ] **Step 3: Manual verification (use the `verify` or `run` skill)**

Temporarily mount each primitive behind a dev toggle (or verify in WS3/WS4 where they get real triggers). Confirm: expense logs + toasts; reminder picker lists open invoices and opens the draft dialog; timer picker starts a timer; report menu navigates.

- [ ] **Step 4: Commit**

```bash
git add src/components/actions/index.ts
git commit -m "feat(actions): barrel export for action primitives"
```

---

## Self-review notes
- **Spec coverage:** WS1 row of the spec — all four primitives + the picker query. ✅
- **Verified-during-wiring flags** are called out as `> Note:` blocks (expenses invalidation target, `projects.list` input signature, `CollectionsReminderDialog` prop names, `/reports?type=` routes). Resolve each against source before finalizing — they are the only places the plan could drift from reality.
- **Type consistency:** `ActionPrimitiveProps` is defined once in `QuickExpenseSheet.tsx` and imported by the others; barrel re-exports it.
