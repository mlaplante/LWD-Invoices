# Payment Schedule UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add UI for creating and editing payment schedules (split payments) on invoices, using a shared dialog component accessible from both the invoice form and detail page.

**Architecture:** A single `PaymentScheduleDialog` component handles all schedule editing. On the detail page, a trigger button opens the dialog which calls `partialPayments.set` directly. In the invoice form, the dialog updates local state that gets submitted alongside the invoice via extended create/update mutations.

**Tech Stack:** React, tRPC, Zod, Radix Dialog (via shadcn), Prisma, TypeScript

---

### Task 1: Create PaymentScheduleDialog Component

**Files:**
- Create: `src/components/invoices/PaymentScheduleDialog.tsx`

**Step 1: Create the dialog component with full UI**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

export type PartialPaymentEntry = {
  sortOrder: number;
  amount: number;
  isPercentage: boolean;
  dueDate: string; // ISO date string
  notes: string;
  isPaid?: boolean;
  paidAt?: Date | null;
  id?: string; // present when editing existing
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceTotal: number;
  invoiceDueDate?: string | null;
  currencySymbol: string;
  currencySymbolPosition: string;
  existingSchedule?: PartialPaymentEntry[];
  onSave: (schedule: PartialPaymentEntry[]) => void;
  saving?: boolean;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentScheduleDialog({
  open,
  onOpenChange,
  invoiceTotal,
  invoiceDueDate,
  currencySymbol,
  currencySymbolPosition,
  existingSchedule,
  onSave,
  saving,
}: Props) {
  const [entries, setEntries] = useState<PartialPaymentEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      if (existingSchedule && existingSchedule.length > 0) {
        setEntries(existingSchedule.map((e) => ({ ...e })));
      } else {
        setEntries([]);
      }
      setExpandedNotes(new Set());
    }
  }, [open, existingSchedule]);

  const fmt = (n: number) =>
    currencySymbolPosition === "before"
      ? `${currencySymbol}${n.toFixed(2)}`
      : `${n.toFixed(2)}${currencySymbol}`;

  const baseDate = invoiceDueDate || today();

  // ── Presets ──────────────────────────────────────────────────
  function applyPreset(count: number) {
    const paidEntries = entries.filter((e) => e.isPaid);
    const perPayment = Math.floor((10000 / count)) / 100; // percentage with 2 decimals
    const remainder = 100 - perPayment * (count - 1);

    const newEntries: PartialPaymentEntry[] = Array.from({ length: count }, (_, i) => ({
      sortOrder: paidEntries.length + i,
      amount: i === count - 1 ? parseFloat(remainder.toFixed(2)) : perPayment,
      isPercentage: true,
      dueDate: addDays(baseDate, 30 * (i + 1)),
      notes: "",
    }));

    setEntries([...paidEntries, ...newEntries]);
  }

  // ── Entry management ─────────────────────────────────────────
  function addEntry() {
    const lastDate = entries.length > 0
      ? entries[entries.length - 1].dueDate
      : baseDate;
    setEntries((prev) => [
      ...prev,
      {
        sortOrder: prev.length,
        amount: 0,
        isPercentage: false,
        dueDate: addDays(lastDate, 30),
        notes: "",
      },
    ]);
  }

  function updateEntry(index: number, updates: Partial<PartialPaymentEntry>) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...updates } : e))
    );
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleNotes(index: number) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // ── Summary calculation ──────────────────────────────────────
  const paidEntries = entries.filter((e) => e.isPaid);
  const editableEntries = entries.filter((e) => !e.isPaid);

  let scheduledAmount = 0;
  let scheduledPercent = 0;
  const hasMixedModes = entries.some((e) => !e.isPaid && e.isPercentage) &&
    entries.some((e) => !e.isPaid && !e.isPercentage);

  for (const e of entries) {
    if (e.isPercentage) {
      scheduledPercent += e.amount;
      scheduledAmount += (e.amount / 100) * invoiceTotal;
    } else {
      scheduledAmount += e.amount;
    }
  }

  const allPercentage = entries.every((e) => e.isPaid || e.isPercentage);
  const coverageMismatch = allPercentage
    ? Math.abs(scheduledPercent - 100) > 0.01
    : Math.abs(scheduledAmount - invoiceTotal) > 0.01;

  function handleSave() {
    const schedule = entries
      .filter((e) => !e.isPaid)
      .map((e, i) => ({ ...e, sortOrder: (paidEntries.length) + i }));
    onSave(schedule);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Schedule</DialogTitle>
          <DialogDescription>
            Split this invoice ({fmt(invoiceTotal)}) into multiple installments.
          </DialogDescription>
        </DialogHeader>

        {/* ── Quick Presets ─────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Quick split:</span>
          {[2, 3, 4].map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => applyPreset(n)}
            >
              {n} payments
            </Button>
          ))}
        </div>

        {/* ── Paid entries (read-only) ─────────────────────── */}
        {paidEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Paid (locked)
            </p>
            {paidEntries.map((e, i) => (
              <div
                key={e.id ?? `paid-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              >
                <span className="w-6 text-center font-medium">{i + 1}</span>
                <span className="flex-1">
                  {e.isPercentage ? `${e.amount}%` : fmt(e.amount)}
                </span>
                <span>{e.dueDate}</span>
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-600">
                  Paid
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Editable entries ─────────────────────────────── */}
        <div className="space-y-3">
          {editableEntries.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {paidEntries.length > 0 ? "Remaining" : "Installments"}
            </p>
          )}
          {editableEntries.map((entry, relIdx) => {
            const absIdx = paidEntries.length + relIdx;
            return (
              <div key={absIdx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                    {absIdx + 1}
                  </span>

                  {/* Amount */}
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={entry.amount || ""}
                    onChange={(e) =>
                      updateEntry(absIdx, { amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-28 h-8 text-sm"
                    placeholder="Amount"
                  />

                  {/* $/% toggle */}
                  <div className="flex rounded-md border border-input overflow-hidden">
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs transition-colors ${
                        !entry.isPercentage
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => updateEntry(absIdx, { isPercentage: false })}
                    >
                      {currencySymbol}
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs transition-colors ${
                        entry.isPercentage
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => updateEntry(absIdx, { isPercentage: true })}
                    >
                      %
                    </button>
                  </div>

                  {/* Due date */}
                  <Input
                    type="date"
                    value={entry.dueDate}
                    onChange={(e) => updateEntry(absIdx, { dueDate: e.target.value })}
                    className="w-36 h-8 text-sm"
                  />

                  {/* Notes toggle */}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggleNotes(absIdx)}
                    title="Notes"
                  >
                    {expandedNotes.has(absIdx) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {/* Remove */}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => removeEntry(absIdx)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Notes row */}
                {expandedNotes.has(absIdx) && (
                  <div className="pl-8">
                    <Input
                      value={entry.notes}
                      onChange={(e) => updateEntry(absIdx, { notes: e.target.value })}
                      placeholder="Notes (optional)"
                      className="h-7 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addEntry}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Installment
          </Button>
        </div>

        {/* ── Summary bar ──────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span>
                Scheduled:{" "}
                <span className="font-semibold">
                  {allPercentage
                    ? `${scheduledPercent.toFixed(1)}% / 100%`
                    : `${fmt(scheduledAmount)} / ${fmt(invoiceTotal)}`}
                </span>
              </span>
              {coverageMismatch && entries.some((e) => !e.isPaid) && (
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  Doesn&apos;t cover full total
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {entries.some((e) => !e.isPaid) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => setEntries(paidEntries)}
            >
              Clear Schedule
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify the file compiles**

Run: `cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit src/components/invoices/PaymentScheduleDialog.tsx 2>&1 | head -20`
Expected: No errors (or only errors from external imports which is fine for isolated check)

**Step 3: Commit**

```bash
git add src/components/invoices/PaymentScheduleDialog.tsx
git commit -m "feat: add PaymentScheduleDialog component with presets and mix-and-match amounts"
```

---

### Task 2: Add Payment Schedule Button to Invoice Detail Page

**Files:**
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx`

**Step 1: Create the PaymentScheduleButton wrapper component**

Create `src/components/invoices/PaymentScheduleButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { PaymentScheduleDialog, type PartialPaymentEntry } from "./PaymentScheduleDialog";

type Props = {
  invoiceId: string;
  invoiceTotal: number;
  invoiceDueDate?: string | null;
  currencySymbol: string;
  currencySymbolPosition: string;
  existingSchedule: PartialPaymentEntry[];
};

export function PaymentScheduleButton({
  invoiceId,
  invoiceTotal,
  invoiceDueDate,
  currencySymbol,
  currencySymbolPosition,
  existingSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const setSchedule = trpc.partialPayments.set.useMutation({
    onSuccess: () => {
      toast.success("Payment schedule saved");
      setOpen(false);
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave(schedule: PartialPaymentEntry[]) {
    setSchedule.mutate({
      invoiceId,
      schedule: schedule.map((s) => ({
        sortOrder: s.sortOrder,
        amount: s.amount,
        isPercentage: s.isPercentage,
        dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
        notes: s.notes || undefined,
      })),
    });
  }

  const hasSchedule = existingSchedule.length > 0;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
        {hasSchedule ? "Edit Schedule" : "Payment Schedule"}
      </Button>
      <PaymentScheduleDialog
        open={open}
        onOpenChange={setOpen}
        invoiceTotal={invoiceTotal}
        invoiceDueDate={invoiceDueDate}
        currencySymbol={currencySymbol}
        currencySymbolPosition={currencySymbolPosition}
        existingSchedule={existingSchedule}
        onSave={handleSave}
        saving={setSchedule.isPending}
      />
    </>
  );
}
```

**Step 2: Add the button to the invoice detail page**

In `src/app/(dashboard)/invoices/[id]/page.tsx`:

Add import at the top (after the MarkPartialPaidButton import, around line 17):
```tsx
import { PaymentScheduleButton } from "@/components/invoices/PaymentScheduleButton";
```

Add the button in the action bar. Insert after the `RecordPaymentButton` block (after line 159), before `ConvertEstimateButton`:

```tsx
          {invoice.type !== "CREDIT_NOTE" && (
            <PaymentScheduleButton
              invoiceId={invoice.id}
              invoiceTotal={Number(invoice.total)}
              invoiceDueDate={invoice.dueDate?.toISOString().slice(0, 10)}
              currencySymbol={sym}
              currencySymbolPosition={symPos}
              existingSchedule={invoice.partialPayments.map((pp) => ({
                id: pp.id,
                sortOrder: pp.sortOrder,
                amount: Number(pp.amount),
                isPercentage: pp.isPercentage,
                dueDate: pp.dueDate ? new Date(pp.dueDate).toISOString().slice(0, 10) : "",
                notes: pp.notes ?? "",
                isPaid: pp.isPaid,
                paidAt: pp.paidAt,
              }))}
            />
          )}
```

**Step 3: Run build to verify**

Run: `cd /Users/mlaplante/Sites/pancake && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/invoices/PaymentScheduleButton.tsx src/app/(dashboard)/invoices/[id]/page.tsx
git commit -m "feat: add payment schedule button to invoice detail page"
```

---

### Task 3: Integrate Payment Schedule into Invoice Form

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx`

**Step 1: Add schedule state and dialog to InvoiceForm**

Add import (after line 18, the `trpc` import):
```tsx
import { PaymentScheduleDialog, type PartialPaymentEntry } from "./PaymentScheduleDialog";
import { CalendarRange, X } from "lucide-react";
```

Add `partialPayments` to the `InvoiceFormData` type (after line 31, the `reminderDaysOverride` field):
```tsx
  partialPayments?: PartialPaymentEntry[];
```

Add state for the dialog (after line 73, the `useCustomReminders` state):
```tsx
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<PartialPaymentEntry[]>(
    initialData?.partialPayments ?? []
  );
```

Update `buildInput()` to include partial payments. After `reminderDaysOverride` (line 138), add:
```tsx
      partialPayments: schedule.length > 0
        ? schedule.map((s) => ({
            sortOrder: s.sortOrder,
            amount: s.amount,
            isPercentage: s.isPercentage,
            dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
            notes: s.notes || undefined,
          }))
        : undefined,
```

**Step 2: Add the schedule button UI in the form**

Insert after the Line Items `</div>` (after line 286), before the Notes section:

```tsx
      {/* Payment Schedule */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Payment Schedule</h3>
          {schedule.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {schedule.length} payment{schedule.length !== 1 ? "s" : ""} scheduled
              <button
                type="button"
                onClick={() => setSchedule([])}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setScheduleOpen(true)}
        >
          <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
          {schedule.length > 0 ? "Edit Schedule" : "Set Up Payment Schedule"}
        </Button>
        <PaymentScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          invoiceTotal={invoiceTotals.total}
          invoiceDueDate={form.dueDate || null}
          currencySymbol={sym}
          currencySymbolPosition={symPos}
          existingSchedule={schedule}
          onSave={(s) => {
            setSchedule(s);
            setScheduleOpen(false);
          }}
        />
      </div>
```

**Step 3: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/invoices/InvoiceForm.tsx
git commit -m "feat: add payment schedule setup to invoice form"
```

---

### Task 4: Extend Server Mutations to Accept Partial Payments

**Files:**
- Modify: `src/server/routers/invoices.ts`

**Step 1: Add partialPayments to the write schema**

In `src/server/routers/invoices.ts`, import the partial payment schema shape. After `invoiceWriteSchema` (line 46), add a new extended schema:

```tsx
const partialPaymentInputSchema = z.object({
  sortOrder: z.number().int().default(0),
  amount: z.number().positive(),
  isPercentage: z.boolean().default(false),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

const invoiceWriteWithScheduleSchema = invoiceWriteSchema.extend({
  partialPayments: z.array(partialPaymentInputSchema).optional(),
});
```

**Step 2: Update create mutation to use new schema and handle partial payments**

Change the create mutation input from `invoiceWriteSchema` to `invoiceWriteWithScheduleSchema` (line 193):

```tsx
  create: protectedProcedure
    .input(invoiceWriteWithScheduleSchema)
    .mutation(async ({ ctx, input }) => {
```

After the invoice is created inside the transaction (after the `tx.invoice.create` call, before the transaction return), add partial payment creation. Replace the transaction body to add after the `create` call:

Inside the `$transaction` callback, after `tx.invoice.create(...)` stores result in `invoice` variable but before returning, add:

```tsx
        if (input.partialPayments && input.partialPayments.length > 0) {
          await tx.partialPayment.createMany({
            data: input.partialPayments.map((s) => ({
              ...s,
              invoiceId: invoice.id,
              organizationId: ctx.orgId,
            })),
          });
        }

        return tx.invoice.findUnique({
          where: { id: invoice.id },
          include: fullInvoiceInclude,
        }) as typeof invoice;
```

Note: The existing `return tx.invoice.create(...)` with `include: fullInvoiceInclude` already returns the invoice. We need to restructure slightly: store the create result, then conditionally add partial payments, then re-fetch to include them.

**Step 3: Update the update mutation similarly**

Change the update mutation input (line 277) to merge with the schedule schema:

```tsx
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(invoiceWriteWithScheduleSchema.partial()))
    .mutation(async ({ ctx, input }) => {
```

At the end of the update transaction, after the invoice update, add:

```tsx
        if (input.partialPayments !== undefined) {
          await tx.partialPayment.deleteMany({
            where: { invoiceId: id, isPaid: false },
          });
          if (input.partialPayments.length > 0) {
            await tx.partialPayment.createMany({
              data: input.partialPayments.map((s) => ({
                ...s,
                invoiceId: id,
                organizationId: ctx.orgId,
              })),
            });
          }
        }
```

**Step 4: Verify build**

Run: `cd /Users/mlaplante/Sites/pancake && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/server/routers/invoices.ts
git commit -m "feat: extend invoice create/update mutations to accept partial payments"
```

---

### Task 5: Build Verification and Manual Testing

**Files:** None (testing only)

**Step 1: Full build check**

Run: `cd /Users/mlaplante/Sites/pancake && npm run build 2>&1 | tail -30`
Expected: Build succeeds with no errors

**Step 2: Run existing tests**

Run: `cd /Users/mlaplante/Sites/pancake && npm test 2>&1 | tail -30`
Expected: All existing tests pass

**Step 3: Manual testing checklist**

1. Create a new invoice → click "Set Up Payment Schedule" → use "3 payments" preset → verify entries auto-fill with percentages and 30-day spacing → save invoice
2. Open the created invoice detail page → verify "Payment Schedule" table shows the 3 installments
3. Click "Edit Schedule" on detail page → modify an amount → save → verify changes persist
4. Click "Clear Schedule" → save → verify schedule is removed
5. Add a mix of $ and % entries → verify summary bar shows correct totals and warning when mismatched
6. Mark one payment as paid → edit schedule → verify paid entry is locked/grayed out

**Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during payment schedule testing"
```
