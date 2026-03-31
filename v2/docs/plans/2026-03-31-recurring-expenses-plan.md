# Recurring Expenses Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add recurring expense templates that auto-generate expense records on a schedule, following the existing RecurringInvoice pattern.

**Architecture:** New `RecurringExpense` Prisma model as a template. Inngest cron function (mirroring `processRecurringInvoices`) creates expenses when due. On-page-load catch-up in `expenses.list` ensures nothing is missed. New tRPC router + CRUD pages under `/expenses/recurring`.

**Tech Stack:** Prisma 7, tRPC v11, Inngest, Next.js App Router, shadcn/ui, Tailwind v4

---

### Task 1: Prisma Schema — RecurringExpense Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add RecurringExpense model to schema**

Add after the Expense model:

```prisma
model RecurringExpense {
  id              String             @id @default(cuid())
  name            String
  description     String?
  qty             Int                @default(1)
  rate            Decimal            @db.Decimal(20, 10)
  reimbursable    Boolean            @default(false)

  frequency       RecurringFrequency
  interval        Int                @default(1)
  startDate       DateTime
  nextRunAt       DateTime
  endDate         DateTime?
  maxOccurrences  Int?
  occurrenceCount Int                @default(0)
  isActive        Boolean            @default(true)

  taxId          String?
  tax            Tax?             @relation("RecurringExpenseTax", fields: [taxId], references: [id])
  categoryId     String?
  category       ExpenseCategory? @relation("RecurringExpenseCategory", fields: [categoryId], references: [id])
  supplierId     String?
  supplier       ExpenseSupplier? @relation("RecurringExpenseSupplier", fields: [supplierId], references: [id])
  projectId      String?
  project        Project?         @relation("RecurringExpenseProject", fields: [projectId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  generatedExpenses Expense[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Step 2: Add `recurringExpenseId` FK to Expense model**

```prisma
// Add to the Expense model:
  recurringExpenseId String?
  recurringExpense   RecurringExpense? @relation(fields: [recurringExpenseId], references: [id], onDelete: SetNull)
```

**Step 3: Add reverse relations on related models**

Add `recurringExpenses RecurringExpense[]` (with appropriate relation names) to:
- `Tax` model — `@relation("RecurringExpenseTax")`
- `ExpenseCategory` model — `@relation("RecurringExpenseCategory")`
- `ExpenseSupplier` model — `@relation("RecurringExpenseSupplier")`
- `Project` model — `@relation("RecurringExpenseProject")`
- `Organization` model (unnamed, Prisma will handle)

**Step 4: Run migration**

```bash
cd v2 && npx prisma migrate dev --name add-recurring-expenses
```

**Step 5: Regenerate Prisma client**

```bash
cd v2 && npx prisma generate
```

**Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add RecurringExpense schema with migration"
```

---

### Task 2: Inngest Cron Function — processRecurringExpenses

**Files:**
- Create: `src/inngest/functions/recurring-expenses.ts`
- Modify: `src/app/api/inngest/route.ts`

**Step 1: Create the recurring expenses Inngest function**

Reference: `src/inngest/functions/recurring-invoices.ts` — follow the same pattern exactly.

```typescript
// src/inngest/functions/recurring-expenses.ts
import { inngest } from "../client";
import { db } from "@/server/db";
import { RecurringFrequency } from "@/generated/prisma";
import { computeNextRunAt } from "./recurring-invoices"; // Reuse existing helper

export const processRecurringExpenses = inngest.createFunction(
  { id: "process-recurring-expenses", name: "Process Recurring Expenses" },
  { cron: "0 6 * * *" }, // daily at 6am UTC, same as invoices
  async () => {
    const now = new Date();

    const due = await db.recurringExpense.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
        AND: [
          {
            OR: [
              { maxOccurrences: null },
              { occurrenceCount: { lt: db.recurringExpense.fields.maxOccurrences } },
            ],
          },
        ],
      },
    });

    let succeeded = 0;
    let failed = 0;

    for (const rec of due) {
      try {
        // Generate all missed occurrences (catch-up)
        let nextRun = new Date(rec.nextRunAt);
        let count = rec.occurrenceCount;

        while (nextRun <= now) {
          if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;
          if (rec.endDate !== null && nextRun > rec.endDate) break;

          await db.$transaction(async (tx) => {
            await tx.expense.create({
              data: {
                name: rec.name,
                description: rec.description,
                qty: rec.qty,
                rate: rec.rate,
                reimbursable: rec.reimbursable,
                dueDate: nextRun,
                taxId: rec.taxId,
                categoryId: rec.categoryId,
                supplierId: rec.supplierId,
                projectId: rec.projectId,
                organizationId: rec.organizationId,
                recurringExpenseId: rec.id,
              },
            });

            count++;
            const newNextRun = computeNextRunAt(nextRun, rec.frequency, rec.interval);
            const maxReached = rec.maxOccurrences !== null && count >= rec.maxOccurrences;
            const pastEnd = rec.endDate !== null && newNextRun > rec.endDate;

            await tx.recurringExpense.update({
              where: { id: rec.id },
              data: {
                occurrenceCount: count,
                nextRunAt: newNextRun,
                isActive: !(maxReached || pastEnd),
              },
            });

            nextRun = newNextRun;
          });

          succeeded++;
        }
      } catch {
        failed++;
      }
    }

    return { processed: due.length, succeeded, failed };
  },
);
```

**Step 2: Register in Inngest route**

In `src/app/api/inngest/route.ts`, add:

```typescript
import { processRecurringExpenses } from "@/inngest/functions/recurring-expenses";

// Add to functions array:
functions: [processRecurringInvoices, processOverdueInvoices, processPaymentReminders, cleanupPendingUsers, processRecurringExpenses],
```

**Step 3: Commit**

```bash
git add src/inngest/functions/recurring-expenses.ts src/app/api/inngest/route.ts
git commit -m "feat: add Inngest cron for recurring expense generation"
```

---

### Task 3: On-Page-Load Catch-Up in expenses.list

**Files:**
- Modify: `src/server/routers/expenses.ts`

**Step 1: Add generateDueExpenses helper**

At the top of `src/server/routers/expenses.ts`, add a helper function that generates any overdue recurring expenses for the org. Import `computeNextRunAt` from the Inngest function.

```typescript
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

async function generateDueExpenses(db: any, orgId: string) {
  const now = new Date();
  const due = await db.recurringExpense.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      nextRunAt: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
  });

  for (const rec of due) {
    let nextRun = new Date(rec.nextRunAt);
    let count = rec.occurrenceCount;

    while (nextRun <= now) {
      if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;
      if (rec.endDate !== null && nextRun > rec.endDate) break;

      await db.$transaction(async (tx: any) => {
        await tx.expense.create({
          data: {
            name: rec.name,
            description: rec.description,
            qty: rec.qty,
            rate: rec.rate,
            reimbursable: rec.reimbursable,
            dueDate: nextRun,
            taxId: rec.taxId,
            categoryId: rec.categoryId,
            supplierId: rec.supplierId,
            projectId: rec.projectId,
            organizationId: rec.organizationId,
            recurringExpenseId: rec.id,
          },
        });

        count++;
        const newNextRun = computeNextRunAt(nextRun, rec.frequency, rec.interval);
        const maxReached = rec.maxOccurrences !== null && count >= rec.maxOccurrences;
        const pastEnd = rec.endDate !== null && newNextRun > rec.endDate;

        await tx.recurringExpense.update({
          where: { id: rec.id },
          data: {
            occurrenceCount: count,
            nextRunAt: newNextRun,
            isActive: !(maxReached || pastEnd),
          },
        });

        nextRun = newNextRun;
      });
    }
  }
}
```

**Step 2: Call it at the start of expenses.list**

In the `list` procedure, add before the query:

```typescript
// Generate any overdue recurring expenses before listing
await generateDueExpenses(ctx.db, ctx.orgId);
```

**Step 3: Commit**

```bash
git add src/server/routers/expenses.ts
git commit -m "feat: add on-page-load catch-up for recurring expenses"
```

---

### Task 4: tRPC Router — recurringExpenses

**Files:**
- Create: `src/server/routers/recurringExpenses.ts`
- Modify: `src/server/routers/_app.ts`

**Step 1: Create the router**

Follow the same pattern as `src/server/routers/recurringInvoices.ts`.

```typescript
// src/server/routers/recurringExpenses.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { RecurringFrequency } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

const recurringExpenseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  qty: z.number().int().positive().default(1),
  rate: z.number(),
  reimbursable: z.boolean().default(false),
  frequency: z.nativeEnum(RecurringFrequency),
  interval: z.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  taxId: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  projectId: z.string().optional(),
});

export const recurringExpensesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.recurringExpense.findMany({
      where: { organizationId: ctx.orgId },
      include: {
        tax: true,
        category: true,
        supplier: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rec = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
          generatedExpenses: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      return rec;
    }),

  create: protectedProcedure
    .input(recurringExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.recurringExpense.create({
        data: {
          ...input,
          organizationId: ctx.orgId,
          nextRunAt: input.startDate,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(recurringExpenseSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Recalculate nextRunAt if schedule changed
      const scheduleChanged = data.frequency || data.interval || data.startDate;
      const updateData: any = { ...data };
      if (scheduleChanged) {
        const freq = data.frequency ?? existing.frequency;
        const intv = data.interval ?? existing.interval;
        const start = data.startDate ?? existing.startDate;
        const now = new Date();
        if (start > now) {
          updateData.nextRunAt = start;
        } else {
          // Walk forward from startDate until we find the next future date
          let next = new Date(start);
          while (next <= now) {
            next = computeNextRunAt(next, freq, intv);
          }
          updateData.nextRunAt = next;
        }
      }

      return ctx.db.recurringExpense.update({
        where: { id, organizationId: ctx.orgId },
        data: updateData,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringExpense.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringExpense.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isActive: !existing.isActive },
      });
    }),
});
```

**Step 2: Register in appRouter**

In `src/server/routers/_app.ts`:

```typescript
import { recurringExpensesRouter } from "./recurringExpenses";

// Add to appRouter:
recurringExpenses: recurringExpensesRouter,
```

**Step 3: Commit**

```bash
git add src/server/routers/recurringExpenses.ts src/server/routers/_app.ts
git commit -m "feat: add recurringExpenses tRPC router with CRUD + toggleActive"
```

---

### Task 5: UI — Recurring Expense List Page

**Files:**
- Create: `src/app/(dashboard)/expenses/recurring/page.tsx`
- Create: `src/components/expenses/RecurringExpenseList.tsx`

**Step 1: Create the RecurringExpenseList component**

Follow the same pattern as `src/components/expenses/ExpenseList.tsx`.

```typescript
// src/components/expenses/RecurringExpenseList.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pencil, Trash2, Plus, Pause, Play, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export function RecurringExpenseList() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.recurringExpenses.list.useQuery();

  const deleteMutation = trpc.recurringExpenses.delete.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense deleted");
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  const toggleMutation = trpc.recurringExpenses.toggleActive.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  function formatFrequency(freq: string, interval: number) {
    if (interval === 1) return FREQUENCY_LABELS[freq] ?? freq;
    return `Every ${interval} ${freq.toLowerCase().replace(/ly$/, "")}s`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
              <Link href="/expenses"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Recurring Expenses</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-9">
            Expense templates that auto-generate on a schedule.
          </p>
        </div>
        <Button asChild>
          <Link href="/expenses/recurring/new">
            <Plus className="w-4 h-4 mr-1.5" />
            New Recurring Expense
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            All Recurring Expenses
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-sm text-muted-foreground">No recurring expenses set up yet.</p>
            <Button asChild size="sm">
              <Link href="/expenses/recurring/new">
                <Plus className="w-4 h-4 mr-1.5" />
                Create your first recurring expense
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frequency</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Next Run</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item) => {
                  const amount = item.qty * Number(item.rate);
                  return (
                    <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{item.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {formatFrequency(item.frequency, item.interval)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {item.isActive ? new Date(item.nextRunAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-center text-muted-foreground tabular-nums">
                        {item.occurrenceCount}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {item.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Paused</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleMutation.mutate({ id: item.id })}
                            title={item.isActive ? "Pause" : "Resume"}
                          >
                            {item.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </Button>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/expenses/recurring/${item.id}/edit`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete recurring expense"
        description="Generated expenses will remain. This only removes the recurring template."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}
```

**Step 2: Create the page**

```typescript
// src/app/(dashboard)/expenses/recurring/page.tsx
import { RecurringExpenseList } from "@/components/expenses/RecurringExpenseList";

export default function RecurringExpensesPage() {
  return <RecurringExpenseList />;
}
```

**Step 3: Add "Recurring" link to ExpenseList header**

In `src/components/expenses/ExpenseList.tsx`, add a link next to the "New Expense" button:

```typescript
// Add import: import { Repeat } from "lucide-react";
// In the header div, before the New Expense button:
<Button asChild variant="outline">
  <Link href="/expenses/recurring">
    <Repeat className="w-4 h-4 mr-1.5" />
    Recurring
  </Link>
</Button>
```

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/expenses/recurring/page.tsx src/components/expenses/RecurringExpenseList.tsx src/components/expenses/ExpenseList.tsx
git commit -m "feat: add recurring expenses list page with pause/resume/delete"
```

---

### Task 6: UI — Recurring Expense Form (Create + Edit)

**Files:**
- Create: `src/components/expenses/RecurringExpenseForm.tsx`
- Create: `src/app/(dashboard)/expenses/recurring/new/page.tsx`
- Create: `src/app/(dashboard)/expenses/recurring/[id]/edit/page.tsx`

**Step 1: Create RecurringExpenseForm component**

Based on `src/components/expenses/ExpenseForm.tsx` but adds schedule fields (frequency, interval, startDate, endDate, maxOccurrences) and removes one-time fields (dueDate, paidAt, paymentDetails, receiptUrl).

```typescript
// src/components/expenses/RecurringExpenseForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Tax = { id: string; name: string; rate: number };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };
type Project = { id: string; name: string };

type BaseProps = {
  taxes: Tax[];
  categories: Category[];
  suppliers: Supplier[];
  projects: Project[];
  defaults?: {
    name?: string;
    description?: string;
    qty?: number;
    rate?: number;
    reimbursable?: boolean;
    taxId?: string;
    categoryId?: string;
    supplierId?: string;
    projectId?: string;
    frequency?: string;
    interval?: number;
    startDate?: string;
    endDate?: string;
    maxOccurrences?: number;
  };
};

type Props =
  | (BaseProps & { mode: "create"; recurringExpenseId?: never })
  | (BaseProps & { mode: "edit"; recurringExpenseId: string });

const FREQUENCIES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export function RecurringExpenseForm({
  mode,
  recurringExpenseId,
  taxes,
  categories,
  suppliers,
  projects,
  defaults = {},
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: defaults.name ?? "",
    description: defaults.description ?? "",
    qty: defaults.qty ?? 1,
    rate: defaults.rate != null ? String(defaults.rate) : "",
    reimbursable: defaults.reimbursable ?? false,
    taxId: defaults.taxId ?? "",
    categoryId: defaults.categoryId ?? "",
    supplierId: defaults.supplierId ?? "",
    projectId: defaults.projectId ?? "",
    frequency: defaults.frequency ?? "MONTHLY",
    interval: defaults.interval ?? 1,
    startDate: defaults.startDate ?? "",
    endDate: defaults.endDate ?? "",
    maxOccurrences: defaults.maxOccurrences != null ? String(defaults.maxOccurrences) : "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.recurringExpenses.create.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense created");
      router.push("/expenses/recurring");
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.recurringExpenses.update.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense updated");
      router.push("/expenses/recurring");
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = parseFloat(form.rate);
    if (isNaN(rate)) { setError("Enter a valid amount."); return; }
    if (!form.startDate) { setError("Start date is required."); return; }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      qty: form.qty,
      rate,
      reimbursable: form.reimbursable,
      frequency: form.frequency as any,
      interval: form.interval,
      startDate: new Date(form.startDate),
      endDate: form.endDate ? new Date(form.endDate) : undefined,
      maxOccurrences: form.maxOccurrences ? parseInt(form.maxOccurrences) : undefined,
      taxId: form.taxId || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      projectId: form.projectId || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: recurringExpenseId, ...payload });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Office Rent"
          required
          className="mt-1"
        />
      </div>

      {/* Amount + Qty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Amount (each) <span className="text-destructive">*</span></label>
          <Input
            type="number" min="0" step="0.01"
            value={form.rate}
            onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
            placeholder="0.00" required className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Qty</label>
          <Input
            type="number" min="1" step="1"
            value={form.qty}
            onChange={(e) => setForm((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>
      </div>

      {/* Schedule: Frequency + Interval */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Frequency <span className="text-destructive">*</span></label>
          <Select value={form.frequency} onValueChange={(v) => setForm((p) => ({ ...p, frequency: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Every N periods</label>
          <Input
            type="number" min="1" step="1"
            value={form.interval}
            onChange={(e) => setForm((p) => ({ ...p, interval: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>
      </div>

      {/* Schedule: Start + End + Max */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Start Date <span className="text-destructive">*</span></label>
          <Input
            type="date" value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            required className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Date <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            type="date" value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Max Occurrences <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            type="number" min="1" step="1"
            value={form.maxOccurrences}
            onChange={(e) => setForm((p) => ({ ...p, maxOccurrences: e.target.value }))}
            placeholder="Unlimited" className="mt-1"
          />
        </div>
      </div>

      {/* Category + Supplier + Tax */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Category</label>
          <Select value={form.categoryId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Supplier</label>
          <Select value={form.supplierId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Tax</label>
          <Select value={form.taxId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, taxId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="No tax" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project */}
      <div>
        <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Select value={form.projectId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, projectId: v === "none" ? "" : v }))}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked to a project</SelectItem>
            {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Reimbursable */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox" id="reimbursable"
          checked={form.reimbursable}
          onChange={(e) => setForm((p) => ({ ...p, reimbursable: e.target.checked }))}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="reimbursable" className="text-sm font-medium cursor-pointer">Reimbursable</label>
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional notes" rows={2} className="mt-1"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : mode === "create" ? "Create Recurring Expense" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/expenses/recurring")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

**Step 2: Create the "new" page**

Follow the pattern from `src/app/(dashboard)/expenses/new/page.tsx`. It needs to fetch taxes, categories, suppliers, projects via server-side tRPC caller.

```typescript
// src/app/(dashboard)/expenses/recurring/new/page.tsx
import { createCaller } from "@/server/routers/_app";
import { RecurringExpenseForm } from "@/components/expenses/RecurringExpenseForm";

export default async function NewRecurringExpensePage() {
  const caller = await createCaller();
  const [taxes, categories, suppliers, projects] = await Promise.all([
    caller.taxes.list(),
    caller.expenseCategories.list(),
    caller.expenseSuppliers.list(),
    caller.projects.list({}),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">New Recurring Expense</h1>
      <RecurringExpenseForm
        mode="create"
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
        categories={categories}
        suppliers={suppliers}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
```

**Step 3: Create the "edit" page**

```typescript
// src/app/(dashboard)/expenses/recurring/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { createCaller } from "@/server/routers/_app";
import { RecurringExpenseForm } from "@/components/expenses/RecurringExpenseForm";

export default async function EditRecurringExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await createCaller();

  let rec;
  try {
    rec = await caller.recurringExpenses.getById({ id });
  } catch {
    notFound();
  }

  const [taxes, categories, suppliers, projects] = await Promise.all([
    caller.taxes.list(),
    caller.expenseCategories.list(),
    caller.expenseSuppliers.list(),
    caller.projects.list({}),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Edit Recurring Expense</h1>
      <RecurringExpenseForm
        mode="edit"
        recurringExpenseId={rec.id}
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
        categories={categories}
        suppliers={suppliers}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaults={{
          name: rec.name,
          description: rec.description ?? undefined,
          qty: rec.qty,
          rate: Number(rec.rate),
          reimbursable: rec.reimbursable,
          frequency: rec.frequency,
          interval: rec.interval,
          startDate: rec.startDate.toISOString().split("T")[0],
          endDate: rec.endDate ? rec.endDate.toISOString().split("T")[0] : undefined,
          maxOccurrences: rec.maxOccurrences ?? undefined,
          taxId: rec.taxId ?? undefined,
          categoryId: rec.categoryId ?? undefined,
          supplierId: rec.supplierId ?? undefined,
          projectId: rec.projectId ?? undefined,
        }}
      />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/expenses/RecurringExpenseForm.tsx src/app/\(dashboard\)/expenses/recurring/
git commit -m "feat: add recurring expense create/edit pages and form"
```

---

### Task 7: Build Verification and Final Cleanup

**Step 1: Run the build**

```bash
cd v2 && npm run build
```

Fix any TypeScript errors that arise (common issues: relation names in Prisma, import paths, type mismatches).

**Step 2: Test manually**

- Visit `/expenses` — verify "Recurring" button appears
- Visit `/expenses/recurring` — verify empty state renders
- Create a recurring expense — verify it saves and appears in list
- Edit the recurring expense — verify fields populate correctly
- Toggle active/pause — verify status changes
- Delete — verify it removes the template

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete recurring expenses feature"
```
