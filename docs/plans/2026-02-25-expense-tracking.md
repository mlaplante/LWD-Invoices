# Expense Tracking Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a standalone `/expenses` section so users can create, view, edit and delete business expenses that are not required to be tied to a project.

**Architecture:** Extend the existing `Expense` model (make `projectId` optional, add `paidAt` and `reimbursable`), update the `expenses` tRPC router to support org-wide listing and creation, then build a list page + dedicated create/edit pages under `/expenses`. The existing project-scoped `ExpensesTab` continues to work unchanged.

**Tech Stack:** Prisma 7 (schema + migration), tRPC v11 (router), Next.js 15 App Router (server components + client form), TypeScript, Tailwind v4, shadcn/ui

---

## Task 1: Schema — make `projectId` optional and add new fields

**Files:**
- Modify: `prisma/schema.prisma` (Expense model, lines 579–600)

**Step 1: Edit the Expense model**

Change `projectId String` → `projectId String?` and add two fields after `paymentDetails`:

```prisma
model Expense {
  id             String   @id @default(cuid())
  name           String
  description    String?
  qty            Int      @default(1)
  rate           Decimal  @db.Decimal(20, 10)
  dueDate        DateTime?
  paymentDetails String?
  paidAt         DateTime?
  reimbursable   Boolean  @default(false)
  invoiceLineId  String?
  taxId          String?
  tax            Tax?     @relation(fields: [taxId], references: [id])
  categoryId     String?
  category       ExpenseCategory? @relation(fields: [categoryId], references: [id])
  supplierId     String?
  supplier       ExpenseSupplier? @relation(fields: [supplierId], references: [id])
  projectId      String?
  project        Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Step 2: Run the migration**

```bash
cd /Users/mlaplante/Sites/pancake
npx prisma migrate dev --name add-expense-standalone-fields
```

Expected: Migration created and applied. Prisma client regenerated automatically.

**Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (nullable `projectId` is backward-compatible — existing callers still pass it).

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): make expense projectId optional, add paidAt and reimbursable"
```

---

## Task 2: Update `expenses` tRPC router

**Files:**
- Modify: `src/server/routers/expenses.ts`

**Context:** Currently `list` and `create` both require `projectId: z.string()`. We need to make it optional and handle the org-wide case.

**Step 1: Update `list` — make `projectId` optional**

Replace the `list` procedure input/query:

```ts
list: protectedProcedure
  .input(
    z.object({
      projectId: z.string().optional(),
      unbilledOnly: z.boolean().default(false),
    })
  )
  .query(async ({ ctx, input }) => {
    return ctx.db.expense.findMany({
      where: {
        organizationId: ctx.orgId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.unbilledOnly ? { invoiceLineId: null } : {}),
      },
      include: {
        tax: true,
        category: true,
        supplier: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),
```

**Step 2: Update `create` — make `projectId` optional, add new fields**

Replace the `create` procedure input:

```ts
create: protectedProcedure
  .input(
    z.object({
      projectId: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      qty: z.number().int().default(1),
      rate: z.number(),
      dueDate: z.coerce.date().optional(),
      paidAt: z.coerce.date().optional(),
      reimbursable: z.boolean().default(false),
      paymentDetails: z.string().optional(),
      taxId: z.string().optional(),
      categoryId: z.string().optional(),
      supplierId: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    return ctx.db.expense.create({
      data: { ...input, organizationId: ctx.orgId },
      include: { tax: true, category: true, supplier: true, project: { select: { id: true, name: true } } },
    });
  }),
```

**Step 3: Update `update` — add new fields**

Add `paidAt` and `reimbursable` to the update procedure input:

```ts
update: protectedProcedure
  .input(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      qty: z.number().int().optional(),
      rate: z.number().optional(),
      dueDate: z.coerce.date().optional(),
      paidAt: z.coerce.date().nullable().optional(),
      reimbursable: z.boolean().optional(),
      paymentDetails: z.string().optional(),
      taxId: z.string().nullable().optional(),
      categoryId: z.string().nullable().optional(),
      supplierId: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
    })
  )
  // mutation body stays the same — { id, ...data } spread still works
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/server/routers/expenses.ts
git commit -m "feat(api): make expense projectId optional, add paidAt and reimbursable fields"
```

---

## Task 3: Add `Expenses` nav item to sidebar

**Files:**
- Modify: `src/components/layout/SidebarNav.tsx`

**Step 1: Add the Wallet icon import and nav entry**

In `SidebarNav.tsx`, add `Wallet` to the lucide-react import, then add the nav item to `primaryNav` after `{ href: "/items", ... }`:

```ts
import {
  LayoutDashboard,
  Receipt,
  Users,
  FolderOpen,
  Clock,
  Package,
  Wallet,        // add this
  BarChart2,
  LifeBuoy,
  Settings,
  type LucideIcon,
} from "lucide-react";

const primaryNav: NavItem[] = [
  { href: "/",           label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices",   label: "Invoices",  icon: Receipt },
  { href: "/clients",    label: "Clients",   icon: Users },
  { href: "/projects",   label: "Projects",  icon: FolderOpen },
  { href: "/timesheets", label: "Timesheets",icon: Clock },
  { href: "/items",      label: "Items",     icon: Package },
  { href: "/expenses",   label: "Expenses",  icon: Wallet },  // add this
];
```

**Step 2: Commit**

```bash
git add src/components/layout/SidebarNav.tsx
git commit -m "feat(nav): add Expenses link to sidebar"
```

---

## Task 4: Build the `ExpenseForm` standalone component

**Files:**
- Create: `src/components/expenses/ExpenseForm.tsx`

**Context:** The existing `src/components/projects/ExpenseForm.tsx` requires `projectId` and has no `paidAt`/`reimbursable` fields. We create a new standalone version used by both the create and edit pages.

**Step 1: Create the component**

```tsx
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

type Props = {
  mode: "create" | "edit";
  expenseId?: string;
  taxes: Tax[];
  categories: Category[];
  suppliers: Supplier[];
  projects: Project[];
  defaults?: {
    name?: string;
    description?: string;
    qty?: number;
    rate?: number;
    dueDate?: string;
    paidAt?: string;
    reimbursable?: boolean;
    paymentDetails?: string;
    taxId?: string;
    categoryId?: string;
    supplierId?: string;
    projectId?: string;
  };
};

export function ExpenseForm({
  mode,
  expenseId,
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
    dueDate: defaults.dueDate ?? "",
    paidAt: defaults.paidAt ?? "",
    reimbursable: defaults.reimbursable ?? false,
    paymentDetails: defaults.paymentDetails ?? "",
    taxId: defaults.taxId ?? "",
    categoryId: defaults.categoryId ?? "",
    supplierId: defaults.supplierId ?? "",
    projectId: defaults.projectId ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense created");
      router.push("/expenses");
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense updated");
      router.push("/expenses");
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = parseFloat(form.rate);
    if (isNaN(rate)) {
      setError("Enter a valid amount.");
      return;
    }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      qty: form.qty,
      rate,
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      paidAt: form.paidAt ? new Date(form.paidAt) : undefined,
      reimbursable: form.reimbursable,
      paymentDetails: form.paymentDetails || undefined,
      taxId: form.taxId || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      projectId: form.projectId || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (expenseId) {
      updateMutation.mutate({ id: expenseId, ...payload });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Software subscription"
          required
          className="mt-1"
        />
      </div>

      {/* Amount + Qty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Amount (each) <span className="text-destructive">*</span></label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.rate}
            onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
            placeholder="0.00"
            required
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Qty</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={form.qty}
            onChange={(e) => setForm((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>
      </div>

      {/* Category + Supplier + Tax */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Category</label>
          <Select
            value={form.categoryId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Supplier</label>
          <Select
            value={form.supplierId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Tax</label>
          <Select
            value={form.taxId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, taxId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="No tax" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project (optional) */}
      <div>
        <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Select
          value={form.projectId || "none"}
          onValueChange={(v) => setForm((p) => ({ ...p, projectId: v === "none" ? "" : v }))}
        >
          <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked to a project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked to a project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Paid At + Reimbursable */}
      <div className="grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Date Paid</label>
          <Input
            type="date"
            value={form.paidAt}
            onChange={(e) => setForm((p) => ({ ...p, paidAt: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            id="reimbursable"
            checked={form.reimbursable}
            onChange={(e) => setForm((p) => ({ ...p, reimbursable: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="reimbursable" className="text-sm font-medium cursor-pointer">
            Reimbursable
          </label>
        </div>
      </div>

      {/* Due Date + Payment Details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Due Date</label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Payment Details</label>
          <Input
            value={form.paymentDetails}
            onChange={(e) => setForm((p) => ({ ...p, paymentDetails: e.target.value }))}
            placeholder="Optional"
            className="mt-1"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional notes"
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create Expense" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/expenses")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/expenses/ExpenseForm.tsx
git commit -m "feat(expenses): add standalone ExpenseForm component"
```

---

## Task 5: Build the `/expenses` list page

**Files:**
- Create: `src/app/(dashboard)/expenses/page.tsx`
- Create: `src/app/(dashboard)/expenses/loading.tsx`
- Create: `src/components/expenses/ExpenseList.tsx`

**Context:** The page is a server component that fetches data and passes it to a client `ExpenseList` component (delete mutations need client-side).

**Step 1: Create `ExpenseList` client component**

`src/components/expenses/ExpenseList.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Expense = {
  id: string;
  name: string;
  qty: number;
  rate: { toNumber(): number } | number;
  paidAt: Date | null;
  reimbursable: boolean;
  invoiceLineId: string | null;
  category: { name: string } | null;
  supplier: { name: string } | null;
  project: { id: string; name: string } | null;
};

type Props = {
  initialExpenses: Expense[];
};

export function ExpenseList({ initialExpenses }: Props) {
  const utils = trpc.useUtils();
  const { data: expenses = initialExpenses } = trpc.expenses.list.useQuery(
    {},
    { initialData: initialExpenses }
  );

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const totalAmount = expenses.reduce(
    (s, e) => s + e.qty * (typeof e.rate === "number" ? e.rate : e.rate.toNumber()),
    0
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track business expenses across your organization.
          </p>
        </div>
        <Button asChild>
          <Link href="/expenses/new">
            <Plus className="w-4 h-4 mr-1.5" />
            New Expense
          </Link>
        </Button>
      </div>

      {/* Summary stat */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Expenses</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{expenses.length}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalAmount.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Reimbursable</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">
              {expenses.filter((e) => e.reimbursable).length}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            All Expenses
          </p>
        </div>

        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
            <Button asChild size="sm">
              <Link href="/expenses/new">
                <Plus className="w-4 h-4 mr-1.5" />
                Add your first expense
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Paid</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reimb.</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {expenses.map((expense) => {
                  const amount = expense.qty * (typeof expense.rate === "number" ? expense.rate : expense.rate.toNumber());
                  return (
                    <tr key={expense.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{expense.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.category?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.project ? (
                          <Link href={`/projects/${expense.project.id}`} className="hover:text-primary transition-colors">
                            {expense.project.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {expense.paidAt
                          ? new Date(expense.paidAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {expense.reimbursable ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Yes
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/expenses/${expense.id}/edit`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                          {!expense.invoiceLineId && (
                            <ConfirmDialog
                              title="Delete expense"
                              description="This cannot be undone."
                              onConfirm={() => deleteMutation.mutate({ id: expense.id })}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </ConfirmDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/20">
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-right">Total</td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">${totalAmount.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create the server page**

`src/app/(dashboard)/expenses/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import { ExpenseList } from "@/components/expenses/ExpenseList";

export default async function ExpensesPage() {
  const expenses = await api.expenses.list({});
  return <ExpenseList initialExpenses={expenses} />;
}
```

**Step 3: Create skeleton loading state**

`src/app/(dashboard)/expenses/loading.tsx`:

```tsx
export default function ExpensesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-lg bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-9 w-32 rounded-xl bg-muted" />
      </div>
      <div className="h-64 w-full rounded-2xl bg-muted" />
    </div>
  );
}
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/app/(dashboard)/expenses/ src/components/expenses/ExpenseList.tsx
git commit -m "feat(expenses): add expenses list page with summary stats and delete"
```

---

## Task 6: Build the `/expenses/new` create page

**Files:**
- Create: `src/app/(dashboard)/expenses/new/page.tsx`

**Step 1: Create the page**

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

export default async function NewExpensePage() {
  const [taxes, categories, suppliers, projects] = await Promise.all([
    api.taxes.list(),
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
    api.projects.list({ status: "ACTIVE" }),
  ]);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/expenses"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Expenses
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Expense</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ExpenseForm
          mode="create"
          taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
          categories={categories}
          suppliers={suppliers}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}
```

**Note on `api.projects.list`:** Check the signature of `projects.list` in `src/server/routers/projects.ts`. If it accepts a `status` filter, pass `{ status: "ACTIVE" }`. If not, just call `api.projects.list({})` and the dropdown will show all projects.

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors. If `projects.list` doesn't accept a status param, adjust the call accordingly.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/expenses/new/page.tsx
git commit -m "feat(expenses): add new expense page"
```

---

## Task 7: Build the `/expenses/[id]/edit` edit page

**Files:**
- Create: `src/app/(dashboard)/expenses/[id]/edit/page.tsx`

**Step 1: Create the page**

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: Props) {
  const { id } = await params;

  const [taxes, categories, suppliers, projects] = await Promise.all([
    api.taxes.list(),
    api.expenseCategories.list(),
    api.expenseSuppliers.list(),
    api.projects.list({}),
  ]);

  // Fetch this specific expense from the org-wide list
  const allExpenses = await api.expenses.list({});
  const expense = allExpenses.find((e) => e.id === id);
  if (!expense) notFound();

  const formatDate = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString().split("T")[0] : "";

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/expenses"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Expenses
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Edit Expense</h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ExpenseForm
          mode="edit"
          expenseId={id}
          taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
          categories={categories}
          suppliers={suppliers}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaults={{
            name: expense.name,
            description: expense.description ?? undefined,
            qty: expense.qty,
            rate: expense.rate.toNumber(),
            dueDate: formatDate(expense.dueDate),
            paidAt: formatDate(expense.paidAt),
            reimbursable: expense.reimbursable,
            paymentDetails: expense.paymentDetails ?? undefined,
            taxId: expense.taxId ?? undefined,
            categoryId: expense.categoryId ?? undefined,
            supplierId: expense.supplierId ?? undefined,
            projectId: expense.projectId ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
```

**Note:** The edit page fetches via `api.expenses.list({})` then finds by id. This is simple and avoids adding a separate `getById` procedure. If performance matters later, a dedicated `expenses.get` procedure can be added.

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors. `expense.paidAt` and `expense.reimbursable` should now exist from the schema migration.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/expenses/[id]/edit/page.tsx
git commit -m "feat(expenses): add edit expense page"
```

---

## Task 8: Fix `reports.expenseBreakdown` for nullable `projectId`

**Files:**
- Modify: `src/app/(dashboard)/reports/expenses/page.tsx`

**Context:** The reports page renders `e.project.name` via `Link`. After the schema change, `project` can be null. This will throw at runtime for standalone expenses.

**Step 1: Update the reports page to handle null project**

In `src/app/(dashboard)/reports/expenses/page.tsx`, change the project table cell from:

```tsx
<td className="px-6 py-3.5 text-muted-foreground">
  <Link href={`/projects/${e.project.id}`} className="hover:text-primary transition-colors">
    {e.project.name}
  </Link>
</td>
```

To:

```tsx
<td className="px-6 py-3.5 text-muted-foreground">
  {e.project ? (
    <Link href={`/projects/${e.project.id}`} className="hover:text-primary transition-colors">
      {e.project.name}
    </Link>
  ) : "—"}
</td>
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/reports/expenses/page.tsx
git commit -m "fix(reports): handle nullable project on expense breakdown report"
```

---

## Task 9: Smoke test the full feature

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test the create flow**

1. Navigate to `http://localhost:3000/expenses`
2. Confirm the Expenses nav item is active in the sidebar
3. Click "New Expense"
4. Fill in: Name = "Test Expense", Amount = 100, Reimbursable = checked, Date Paid = today
5. Submit — should redirect to `/expenses` with a success toast
6. Confirm the new expense appears in the table with the Reimbursable "Yes" badge and date

**Step 3: Test the edit flow**

1. Click the pencil icon on the expense just created
2. Change the name, submit
3. Confirm the update appears in the list

**Step 4: Test the delete flow**

1. Click the trash icon on a non-billed expense
2. Confirm the dialog appears, confirm deletion
3. Expense is removed from the list

**Step 5: Test project-scoped expenses still work**

1. Navigate to any project → Expenses tab
2. Add an expense — it should still work (projectId is still passed)

**Step 6: Check the reports page**

1. Navigate to Reports → Expense Breakdown
2. Any existing project-linked expenses show project links; new standalone expenses show "—" in the Project column

**Step 7: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat(expenses): complete standalone expense tracking section"
```
