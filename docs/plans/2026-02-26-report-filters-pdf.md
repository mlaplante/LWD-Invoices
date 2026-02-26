# Report Filters & Print/PDF Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add date range filters and a print-to-PDF button to all 6 report pages.

**Architecture:** Filters use URL search params so pages remain server components — a shared `ReportFilters` client component updates the URL via `router.replace()`, and each page reads the async `searchParams` prop (Next.js 15 pattern) to pass dates to existing tRPC calls. PDF export uses a `PrintReportButton` that calls `window.print()`, with Tailwind `print:hidden` utilities to hide sidebar, nav, filter bar, and action buttons from printed output.

**Tech Stack:** Next.js 15 App Router (async searchParams), tRPC v11, Tailwind CSS print utilities, lucide-react

---

### Task 1: Create PrintReportButton component

**Files:**
- Create: `src/components/reports/PrintReportButton.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
    >
      <Printer className="w-3.5 h-3.5" />
      Print / Save PDF
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/reports/PrintReportButton.tsx
git commit -m "feat(reports): add PrintReportButton component"
```

---

### Task 2: Create ReportFilters component

**Files:**
- Create: `src/components/reports/ReportFilters.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  basePath: string;
  from?: string;
  to?: string;
  children?: React.ReactNode; // slot for extra filters (e.g. category dropdown)
};

const PRESETS = [
  {
    label: "This Month",
    getValue: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
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
        from: new Date(y, m, 1).toISOString().slice(0, 10),
        to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      };
    },
  },
  {
    label: "This Year",
    getValue: () => {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "Last Year",
    getValue: () => {
      const y = new Date().getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    getValue: () => ({ from: "", to: "" }),
  },
];

export function ReportFilters({ basePath, from = "", to = "", children }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground font-medium">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => updateParams({ from: e.target.value })}
          className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground font-medium">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => updateParams({ to: e.target.value })}
          className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => updateParams(p.getValue())}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/reports/ReportFilters.tsx
git commit -m "feat(reports): add ReportFilters component with date range and presets"
```

---

### Task 3: Add print:hidden to dashboard layout

The sidebar and nav need to be hidden when printing. The layout has four elements to mark:
- `<aside>` (desktop sidebar, line 28)
- `<header className="lg:hidden ...">` (mobile fixed header, line 61)
- `<header className="hidden lg:flex ...">` (desktop top bar, line 82)
- `<MobileNav />` (mobile bottom nav, line 99)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Add `print:hidden` class to each element**

Desktop sidebar — change:
```tsx
<aside className="hidden lg:flex w-56 shrink-0 flex-col p-4 gap-0 bg-sidebar">
```
to:
```tsx
<aside className="hidden lg:flex w-56 shrink-0 flex-col p-4 gap-0 bg-sidebar print:hidden">
```

Mobile fixed header — change:
```tsx
<header className="lg:hidden fixed top-0 inset-x-0 z-20 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border">
```
to:
```tsx
<header className="lg:hidden fixed top-0 inset-x-0 z-20 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border print:hidden">
```

Desktop top bar — change:
```tsx
<header className="hidden lg:flex items-center justify-end gap-3 mb-5 px-1">
```
to:
```tsx
<header className="hidden lg:flex items-center justify-end gap-3 mb-5 px-1 print:hidden">
```

MobileNav wrapper — change:
```tsx
<MobileNav orgName={orgName} />
```
to:
```tsx
<div className="print:hidden"><MobileNav orgName={orgName} /></div>
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat(reports): hide sidebar and nav from print output"
```

---

### Task 4: Update Payments by Gateway page

**Files:**
- Modify: `src/app/(dashboard)/reports/payments/page.tsx`

**Step 1: Replace the full page content**

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, CreditCard, Landmark, DollarSign, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";

const GATEWAY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  STRIPE:        { label: "Stripe",        icon: <CreditCard className="w-4 h-4" />, color: "bg-violet-50 text-violet-600" },
  PAYPAL:        { label: "PayPal",        icon: <DollarSign className="w-4 h-4" />, color: "bg-blue-50 text-blue-600" },
  BANK_TRANSFER: { label: "Bank Transfer", icon: <Landmark className="w-4 h-4" />,   color: "bg-emerald-50 text-emerald-600" },
  CASH:          { label: "Cash",          icon: <Banknote className="w-4 h-4" />,   color: "bg-amber-50 text-amber-600" },
};

export default async function PaymentsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const from = params.from ? new Date(params.from) : undefined;
  const to = params.to ? new Date(params.to) : undefined;

  const byGateway = await api.reports.paymentsByGateway({ from, to });
  const entries = Object.entries(byGateway);

  const totalRevenue = entries.reduce((sum, [, s]) => sum + s.total, 0);
  const totalFees = entries.reduce((sum, [, s]) => sum + s.fees, 0);
  const totalTxns = entries.reduce((sum, [, s]) => sum + s.count, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Payments by Gateway</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/payments" from={params.from} to={params.to} />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Transactions</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{totalTxns}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Gateway Fees</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-red-600">-${totalFees.toFixed(2)}</p>
        </div>
      </div>

      {/* Gateway breakdown */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card flex flex-col items-center justify-center py-14 text-center">
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([method, stats]) => {
            const config = GATEWAY_CONFIG[method] ?? {
              label: method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              icon: <CreditCard className="w-4 h-4" />,
              color: "bg-gray-100 text-gray-500",
            };
            const net = stats.total - stats.fees;
            return (
              <div key={method} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", config.color)}>
                    {config.icon}
                  </div>
                  <p className="font-semibold">{config.label}</p>
                </div>
                <div className="px-5 py-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transactions</span>
                    <span className="font-semibold tabular-nums">{stats.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Revenue</span>
                    <span className="font-semibold tabular-nums">${stats.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gateway Fees</span>
                    <span className="font-semibold tabular-nums text-red-600">-${stats.fees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/40 pt-2.5">
                    <span className="font-semibold">Net Revenue</span>
                    <span className="font-bold tabular-nums">${net.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/reports/payments/page.tsx
git commit -m "feat(reports): add date filters and print button to Payments report"
```

---

### Task 5: Update Profit & Loss page

**Files:**
- Modify: `src/app/(dashboard)/reports/profit-loss/page.tsx`

**Step 1: Replace the full page content**

Key changes from original:
- Add `searchParams: Promise<Record<string, string>>` prop and `await searchParams`
- Replace hardcoded `from = new Date(now.getFullYear() - 1, now.getMonth(), 1)` with `params.from ? new Date(params.from) : defaultFrom`
- Add `ReportFilters` after the header
- Add `PrintReportButton` in the header
- Add `print:hidden` to the back-link ArrowLeft

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortMonth(key: string) {
  return MONTH_NAMES[parseInt(key.split("-")[1], 10) - 1] ?? "";
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const from = params.from ? new Date(params.from) : defaultFrom;
  const to = params.to ? new Date(params.to) : undefined;

  const data = await api.reports.profitLoss({ from, to });

  const months = Array.from(
    new Set([...Object.keys(data.revenueByMonth), ...Object.keys(data.expensesByMonth)])
  ).sort().slice(-12);

  const maxVal = Math.max(...months.flatMap((m) => [data.revenueByMonth[m] ?? 0, data.expensesByMonth[m] ?? 0]), 1);
  const CHART_H = 100;
  const BAR_W = 14;
  const BAR_GAP = 2;
  const GROUP_GAP = 6;
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const totalW = months.length * GROUP_W - GROUP_GAP;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/profit-loss" from={params.from} to={params.to} />

      {/* Summary cards — unchanged */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Revenue", value: data.totalRevenue, color: "text-emerald-600" },
          { label: "Total Expenses", value: data.totalExpenses, color: "text-red-600" },
          { label: "Net Income", value: data.netIncome, color: data.netIncome >= 0 ? "text-primary" : "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>${s.value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Chart — unchanged */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5">
        <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
        <div className="overflow-x-auto">
          <svg width={totalW} height={CHART_H + 28} viewBox={`0 0 ${totalW} ${CHART_H + 28}`} style={{ display: "block" }}>
            {months.map((m, i) => {
              const rev = data.revenueByMonth[m] ?? 0;
              const exp = data.expensesByMonth[m] ?? 0;
              const x = i * GROUP_W;
              const revH = Math.max((rev / maxVal) * CHART_H, rev > 0 ? 2 : 0);
              const expH = Math.max((exp / maxVal) * CHART_H, exp > 0 ? 2 : 0);
              return (
                <g key={m}>
                  <rect x={x} y={CHART_H - revH} width={BAR_W} height={revH} rx={2} fill="hsl(var(--primary) / 0.7)" />
                  <rect x={x + BAR_W + BAR_GAP} y={CHART_H - expH} width={BAR_W} height={expH} rx={2} fill="hsl(0 72% 51% / 0.5)" />
                  <text x={x + BAR_W} y={CHART_H + 18} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{shortMonth(m)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/70 inline-block" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/50 inline-block" />Expenses</span>
        </div>
      </div>

      {/* Monthly table — unchanged */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border/50">
            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 text-left">Month</th>
              <th className="px-5 py-3 text-right">Revenue</th>
              <th className="px-5 py-3 text-right">Expenses</th>
              <th className="px-5 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const rev = data.revenueByMonth[m] ?? 0;
              const exp = data.expensesByMonth[m] ?? 0;
              const net = rev - exp;
              return (
                <tr key={m} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{shortMonth(m)} {m.split("-")[0]}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">${rev.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-red-600">${exp.toFixed(2)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${net >= 0 ? "text-primary" : "text-red-600"}`}>${net.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/reports/profit-loss/page.tsx
git commit -m "feat(reports): add date filters and print button to Profit & Loss report"
```

---

### Task 6: Update Time Tracking page

**Files:**
- Modify: `src/app/(dashboard)/reports/time/page.tsx`

**Step 1: Replace the full page content**

Key changes:
- Add `searchParams` prop and `await searchParams`
- Replace hardcoded `from = new Date(now.getFullYear(), now.getMonth(), 1)` with `params.from ? new Date(params.from) : defaultFrom`
- Add `ReportFilters` and `PrintReportButton`
- Add `print:hidden` to back link

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function TimeTrackingReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = params.from ? new Date(params.from) : defaultFrom;
  const to = params.to ? new Date(params.to) : undefined;

  const data = await api.reports.timeTracking({ from, to });

  const totalMinutes = data.reduce((s, r) => s + r.totalMinutes, 0);
  const totalBillable = data.reduce((s, r) => s + r.billableAmount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Time Tracking</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/time" from={params.from} to={params.to} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Hours</p>
          <p className="text-2xl font-bold mt-1">{fmtHours(totalMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Billable Value</p>
          <p className="text-2xl font-bold mt-1 text-primary">${totalBillable.toFixed(2)}</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card px-6 py-12 text-center text-muted-foreground text-sm">
          No time entries for this period.
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 text-left">Project</th>
                <th className="px-5 py-3 text-left">Client</th>
                <th className="px-5 py-3 text-right">Hours</th>
                <th className="px-5 py-3 text-right">Billable</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.projectId} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                  <td className="px-5 py-3 font-medium">{row.projectName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.clientName}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmtHours(row.totalMinutes)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">${row.billableAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/reports/time/page.tsx
git commit -m "feat(reports): add date filters and print button to Time Tracking report"
```

---

### Task 7: Update Expense Breakdown page (with category filter)

This task has three parts: update the router, create the category filter component, update the page.

**Files:**
- Modify: `src/server/routers/reports.ts`
- Create: `src/components/reports/ExpenseCategoryFilter.tsx`
- Modify: `src/app/(dashboard)/reports/expenses/page.tsx`

**Step 1: Add `categoryId` filter to `expenseBreakdown` and add `expenseCategories` query in `src/server/routers/reports.ts`**

In `expenseBreakdown`, change the input schema from:
```ts
.input(dateRangeSchema)
```
to:
```ts
.input(dateRangeSchema.extend({ categoryId: z.string().optional() }))
```

And add `...(input.categoryId ? { categoryId: input.categoryId } : {})` to the Prisma `where` clause inside `expenseBreakdown`.

Also add a new procedure at the end of the router (before the closing `}`):

```ts
expenseCategories: protectedProcedure.query(async ({ ctx }) => {
  return ctx.db.expenseCategory.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}),
```

**Step 2: Create ExpenseCategoryFilter client component**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Category = { id: string; name: string };

export function ExpenseCategoryFilter({
  categories,
  selected,
}: {
  categories: Category[];
  selected?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) params.set("categoryId", categoryId);
    else params.delete("categoryId");
    router.replace(`/reports/expenses?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5 print:hidden">
      <label className="text-xs text-muted-foreground font-medium">Category</label>
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
```

**Step 3: Replace full expenses page content**

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ExpenseCategoryFilter } from "@/components/reports/ExpenseCategoryFilter";

export default async function ExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const from = params.from ? new Date(params.from) : undefined;
  const to = params.to ? new Date(params.to) : undefined;
  const categoryId = params.categoryId ?? undefined;

  const [expenses, categories] = await Promise.all([
    api.reports.expenseBreakdown({ from, to, categoryId }),
    api.reports.expenseCategories(),
  ]);

  const totalAmount = expenses.reduce((sum, e) => sum + e.qty * Number(e.rate), 0);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category?.name ?? "Uncategorized";
    byCategory[key] = (byCategory[key] ?? 0) + e.qty * Number(e.rate);
  }
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Expense Breakdown</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/reports/expenses/export"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <PrintReportButton />
        </div>
      </div>

      <ReportFilters basePath="/reports/expenses" from={params.from} to={params.to}>
        <ExpenseCategoryFilter categories={categories} selected={categoryId} />
      </ReportFilters>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Expenses</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{expenses.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalAmount.toFixed(2)}</p>
        </div>
        {topCategories.slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium truncate">{cat}</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${amt.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Expenses table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Expenses</p>
          <p className="text-base font-semibold mt-0.5">All Expenses</p>
        </div>

        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{e.name}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {e.project ? (
                      <Link href={`/projects/${e.project.id}`} className="hover:text-primary transition-colors">
                        {e.project.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">{e.category?.name ?? "—"}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{e.supplier?.name ?? "—"}</td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                    ${(e.qty * Number(e.rate)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              <tr>
                <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-right">Total</td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/server/routers/reports.ts src/components/reports/ExpenseCategoryFilter.tsx src/app/(dashboard)/reports/expenses/page.tsx
git commit -m "feat(reports): add date and category filters and print button to Expenses report"
```

---

### Task 8: Update Unpaid Invoices page (print only)

**Files:**
- Modify: `src/app/(dashboard)/reports/unpaid/page.tsx`

**Step 1: Add PrintReportButton to header**

- Import `PrintReportButton`
- Wrap header in `flex items-center justify-between gap-3`
- Add `print:hidden` to back link and breadcrumb separator
- Add `<PrintReportButton />` at end of header

The page does not accept filters (it always shows current outstanding invoices).

**Step 2: Commit**

```bash
git add src/app/(dashboard)/reports/unpaid/page.tsx
git commit -m "feat(reports): add print button to Unpaid Invoices report"
```

---

### Task 9: Update Invoice Aging page (print only)

**Files:**
- Modify: `src/app/(dashboard)/reports/aging/page.tsx`

**Step 1: Add PrintReportButton to header**

Same pattern as Task 8 — import `PrintReportButton`, wrap header in `justify-between`, add `print:hidden` to back link.

**Step 2: Commit**

```bash
git add src/app/(dashboard)/reports/aging/page.tsx
git commit -m "feat(reports): add print button to Invoice Aging report"
```

---

## Summary

After all tasks complete:

| Report | Filters | Print Button | print:hidden on nav/filters |
|--------|---------|--------------|----------------------------|
| Payments by Gateway | Date range + presets | ✅ | ✅ |
| Profit & Loss | Date range + presets | ✅ | ✅ |
| Time Tracking | Date range + presets | ✅ | ✅ |
| Expense Breakdown | Date range + presets + Category | ✅ | ✅ |
| Unpaid Invoices | — | ✅ | ✅ |
| Invoice Aging | — | ✅ | ✅ |
| Dashboard Layout | — | — | Sidebar + headers hidden |
