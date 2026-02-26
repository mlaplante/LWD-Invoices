# Invoice List Print & Date Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Print/PDF button and date preset shortcuts to the invoices list page.

**Architecture:** Three targeted changes — (1) a new `InvoiceDatePresets` client component that adds quick date shortcuts alongside the existing `DateRangeFilter`, (2) `print:hidden` on interactive/UI columns in `InvoiceTableWithBulk`, (3) updates to the invoices page to wire in the print button, presets, and `print:hidden` on all non-data UI (filters, tabs, pagination, mobile cards).

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4 print utilities, `next/navigation` hooks, lucide-react

---

### Task 1: Create InvoiceDatePresets component

**Files:**
- Create: `src/components/invoices/InvoiceDatePresets.tsx`

**Context:**
The existing `DateRangeFilter` component uses `dateFrom` and `dateTo` URL param names (not `from`/`to`). The presets must use the same names and must preserve all other existing params (like `tab`, `search`, `page`). Use the same timezone-safe `toLocalDateStr` helper pattern established in `ReportFilters.tsx`.

**Step 1: Create the file**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PRESETS = [
  {
    label: "This Month",
    getValue: () => {
      const now = new Date();
      return {
        dateFrom: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
        dateTo: toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "Last Month",
    getValue: () => {
      const now = new Date();
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      return {
        dateFrom: toLocalDateStr(new Date(y, m, 1)),
        dateTo: toLocalDateStr(new Date(y, m + 1, 0)),
      };
    },
  },
  {
    label: "This Year",
    getValue: () => {
      const y = new Date().getFullYear();
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    },
  },
  {
    label: "Last Year",
    getValue: () => {
      const y = new Date().getFullYear() - 1;
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    getValue: () => ({ dateFrom: "", dateTo: "" }),
  },
];

export function InvoiceDatePresets() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(values: { dateFrom: string; dateTo: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.dateFrom) params.set("dateFrom", values.dateFrom);
    else params.delete("dateFrom");
    if (values.dateTo) params.set("dateTo", values.dateTo);
    else params.delete("dateTo");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 print:hidden">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => apply(p.getValue())}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Run TypeScript check**

```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
cd /Users/mlaplante/Sites/pancake && git add src/components/invoices/InvoiceDatePresets.tsx && git commit -m "feat(invoices): add InvoiceDatePresets component with 5 quick-select presets"
```

---

### Task 2: Add print:hidden to InvoiceTableWithBulk

**Files:**
- Modify: `src/components/invoices/InvoiceTableWithBulk.tsx`

**Context:**
When printing, we want only the data columns: Invoice, Date, Client, Amount, Status. We need to hide: the bulk action bar, the checkbox column (header + each row cell), and the actions column (header + each row cell).

**Step 1: Read the file**

Read `src/components/invoices/InvoiceTableWithBulk.tsx` to confirm exact class strings before editing.

**Step 2: Add print:hidden to bulk action bar**

Find:
```tsx
{someSelected && (
  <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-accent/50 border border-border/50">
```

Replace with:
```tsx
{someSelected && (
  <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-accent/50 border border-border/50 print:hidden">
```

**Step 3: Add print:hidden to checkbox header cell**

Find:
```tsx
<th className="pb-3 pl-2 w-8">
```

Replace with:
```tsx
<th className="pb-3 pl-2 w-8 print:hidden">
```

**Step 4: Add print:hidden to actions header cell**

Find:
```tsx
<th className="pb-3" />
```

Replace with:
```tsx
<th className="pb-3 print:hidden" />
```

**Step 5: Add print:hidden to checkbox data cells**

Find (in the row `<td>`):
```tsx
<td className="py-3.5 pl-2">
  <input
    type="checkbox"
    checked={isSelected}
```

Replace with:
```tsx
<td className="py-3.5 pl-2 print:hidden">
  <input
    type="checkbox"
    checked={isSelected}
```

**Step 6: Add print:hidden to actions data cells**

Find:
```tsx
<td className="py-3.5 pr-2">
  <InvoiceRowActions
```

Replace with:
```tsx
<td className="py-3.5 pr-2 print:hidden">
  <InvoiceRowActions
```

**Step 7: Run TypeScript check**

```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

**Step 8: Commit**

```bash
cd /Users/mlaplante/Sites/pancake && git add src/components/invoices/InvoiceTableWithBulk.tsx && git commit -m "feat(invoices): hide bulk actions and checkbox/action columns from print output"
```

---

### Task 3: Update invoices page — print button, presets, print:hidden

**Files:**
- Modify: `src/app/(dashboard)/invoices/page.tsx`

**Context:**
This is a server component. We need to:
- Import `PrintReportButton` (already built at `src/components/reports/PrintReportButton.tsx`)
- Import `InvoiceDatePresets` (just created)
- Add both to the header area (wrapped in `<Suspense>` for the client components that use `useSearchParams`)
- Add `print:hidden` to: the DateRangeFilter/SearchInput/button area, the tab bar
- Add `print:hidden` to mobile card list and `print:block` to desktop table wrapper
- Add `print:hidden` to pagination footer

**Step 1: Read the file**

Read `src/app/(dashboard)/invoices/page.tsx` before editing.

**Step 2: Add imports**

After the existing imports, add:
```tsx
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { InvoiceDatePresets } from "@/components/invoices/InvoiceDatePresets";
```

**Step 3: Update the header section**

Find the header div that contains the filters and New Invoice button:
```tsx
<div className="flex items-center gap-2 flex-wrap">
  <Suspense>
    <DateRangeFilter />
  </Suspense>
  <Suspense>
    <SearchInput placeholder="Search invoices…" />
  </Suspense>
  <Button asChild size="sm">
    <Link href="/invoices/new">+ New Invoice</Link>
  </Button>
</div>
```

Replace with:
```tsx
<div className="flex items-center gap-2 flex-wrap print:hidden">
  <Suspense>
    <InvoiceDatePresets />
  </Suspense>
  <Suspense>
    <DateRangeFilter />
  </Suspense>
  <Suspense>
    <SearchInput placeholder="Search invoices…" />
  </Suspense>
  <Button asChild size="sm">
    <Link href="/invoices/new">+ New Invoice</Link>
  </Button>
</div>
```

Then add `<PrintReportButton />` outside the print:hidden div, in the outer `justify-between` header div. The outer header div currently is:
```tsx
<div className="flex items-center justify-between gap-3 flex-wrap">
  <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
  <div className="flex items-center gap-2 flex-wrap">
    ...
  </div>
</div>
```

Change to:
```tsx
<div className="flex items-center justify-between gap-3 flex-wrap">
  <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
  <div className="flex items-center gap-2 flex-wrap">
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      <Suspense>
        <InvoiceDatePresets />
      </Suspense>
      <Suspense>
        <DateRangeFilter />
      </Suspense>
      <Suspense>
        <SearchInput placeholder="Search invoices…" />
      </Suspense>
      <Button asChild size="sm">
        <Link href="/invoices/new">+ New Invoice</Link>
      </Button>
    </div>
    <PrintReportButton />
  </div>
</div>
```

**Step 4: Add print:hidden to tab bar**

Find:
```tsx
<div className="flex items-center gap-1 border-b border-border">
```

Replace with:
```tsx
<div className="flex items-center gap-1 border-b border-border print:hidden">
```

**Step 5: Fix mobile/desktop visibility for print**

Find:
```tsx
{/* Mobile card list */}
<div className="sm:hidden divide-y divide-border/50">
```

Replace with:
```tsx
{/* Mobile card list */}
<div className="sm:hidden print:hidden divide-y divide-border/50">
```

Find:
```tsx
{/* Desktop table with bulk actions */}
<div className="hidden sm:block overflow-x-auto">
```

Replace with:
```tsx
{/* Desktop table with bulk actions */}
<div className="hidden sm:block print:block overflow-x-auto">
```

**Step 6: Add print:hidden to pagination footer**

Find:
```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground">
```

Replace with:
```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-between border-t border-border/40 px-2 py-3 text-sm text-muted-foreground print:hidden">
```

**Step 7: Run TypeScript check**

```bash
cd /Users/mlaplante/Sites/pancake && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: no errors.

**Step 8: Commit**

```bash
cd /Users/mlaplante/Sites/pancake && git add src/app/(dashboard)/invoices/page.tsx && git commit -m "feat(invoices): add print button, date presets, and print-optimized layout"
```

---

## Summary

After all tasks complete, the invoices list page will have:

| Feature | Where |
|---|---|
| "Print / Save PDF" button | Header, right side |
| Date presets (5 quick-selects) | Header, left of date inputs |
| Sidebar + nav hidden on print | Dashboard layout (already done) |
| Filters, search, tabs hidden on print | `print:hidden` on those wrappers |
| Mobile card list hidden on print | `print:hidden` |
| Desktop table always shown on print | `print:block` override |
| Checkbox + actions columns hidden on print | `print:hidden` on those `<th>`/`<td>` cells |
| Bulk action bar hidden on print | `print:hidden` |
| Pagination hidden on print | `print:hidden` |
