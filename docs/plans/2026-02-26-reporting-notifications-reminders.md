# Reporting Expansion, Comment Notifications & Payment Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add P&L / aging / time tracking reports, invoice CSV export, client comment email notifications, configurable payment reminder timing, and default payment terms at org and client level.

**Architecture:** Schema adds 4 fields across 3 models (one migration). Backend adds queries to the reports router and updates to organization/clients/invoices/portal routers. Frontend updates settings forms, client form, invoice form, and adds three new report pages. The Inngest payment-reminders cron replaces its hardcoded date window with per-org/per-invoice configurable reminder days.

**Tech Stack:** Next.js 15 App Router, tRPC v11, Prisma 7, PostgreSQL, Inngest, Resend + React Email, Tailwind v4, shadcn/ui

---

## Task 1: Schema migration — add payment terms and reminder fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/[timestamp]_payment_terms_reminders/migration.sql` (auto-generated)

**Step 1: Add fields to schema**

In `prisma/schema.prisma`, add to the `Organization` model (after `taskTimeInterval`):
```prisma
defaultPaymentTermsDays Int   @default(30)
paymentReminderDays     Int[] @default([1, 3])
```

Add to the `Client` model (after `notes`):
```prisma
defaultPaymentTermsDays Int?
```

Add to the `Invoice` model (after `isArchived`):
```prisma
reminderDaysOverride Int[] @default([])
```

**Step 2: Run migration**

```bash
cd /Users/mlaplante/Sites/pancake
npx prisma migrate dev --name payment_terms_reminders
```

Expected: Migration created and applied, Prisma client regenerated.

**Step 3: Verify**

```bash
npx prisma studio
```

Check that Organization, Client, and Invoice tables have the new columns.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add payment terms and reminder day fields to org, client, invoice"
```

---

## Task 2: Organization router — expose and update new fields

**Files:**
- Modify: `src/server/routers/organization.ts`

**Step 1: Update the `get` select to include new fields**

In the `get` procedure's `select`, add:
```ts
defaultPaymentTermsDays: true,
paymentReminderDays: true,
```

**Step 2: Update the `update` input schema to accept new fields**

In the `update` input `z.object({...})`, add:
```ts
defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
paymentReminderDays: z.array(z.number().int().min(1).max(365)).optional(),
```

**Step 3: Commit**

```bash
git add src/server/routers/organization.ts
git commit -m "feat(api): expose defaultPaymentTermsDays and paymentReminderDays in org router"
```

---

## Task 3: Clients router — add defaultPaymentTermsDays

**Files:**
- Modify: `src/server/routers/clients.ts`

**Step 1: Add field to `clientSchema`**

In the `clientSchema` z.object, add:
```ts
defaultPaymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
```

**Step 2: Verify the field passes through to create/update**

The existing `create` and `update` mutations use spread (`...rest`) so the new field flows automatically once it's in the schema. No other changes needed.

**Step 3: Commit**

```bash
git add src/server/routers/clients.ts
git commit -m "feat(api): add defaultPaymentTermsDays to clients router"
```

---

## Task 4: Reports router — add profitLoss, invoiceAging, timeTracking

**Files:**
- Modify: `src/server/routers/reports.ts`

**Step 1: Add `profitLoss` query**

Add after the existing `revenueByMonth` procedure:

```ts
profitLoss: protectedProcedure
  .input(dateRangeSchema)
  .query(async ({ ctx, input }) => {
    const [payments, expenses] = await Promise.all([
      ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { paidAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: { amount: true, paidAt: true },
      }),
      ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: { rate: true, qty: true, createdAt: true },
      }),
    ]);

    const revenueByMonth = groupByMonth(payments, (p) => p.paidAt, (p) => Number(p.amount));
    const expensesByMonth = groupByMonth(
      expenses,
      (e) => e.createdAt,
      (e) => Number(e.rate) * e.qty,
    );

    const allMonths = Array.from(new Set([...Object.keys(revenueByMonth), ...Object.keys(expensesByMonth)])).sort();
    const netByMonth: Record<string, number> = {};
    for (const m of allMonths) {
      netByMonth[m] = (revenueByMonth[m] ?? 0) - (expensesByMonth[m] ?? 0);
    }

    const totalRevenue = Object.values(revenueByMonth).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(expensesByMonth).reduce((s, v) => s + v, 0);

    return {
      revenueByMonth,
      expensesByMonth,
      netByMonth,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  }),
```

**Step 2: Add `invoiceAging` query**

```ts
invoiceAging: protectedProcedure.query(async ({ ctx }) => {
  const now = new Date();
  const invoices = await ctx.db.invoice.findMany({
    where: {
      organizationId: ctx.orgId,
      isArchived: false,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
    },
    include: { client: { select: { name: true } }, currency: true },
    orderBy: { dueDate: "asc" },
  });

  type AgingInvoice = typeof invoices[number] & { daysOverdue: number };

  const buckets: { current: AgingInvoice[]; days1_30: AgingInvoice[]; days31_60: AgingInvoice[]; days61_90: AgingInvoice[]; days90plus: AgingInvoice[] } = {
    current: [], days1_30: [], days31_60: [], days61_90: [], days90plus: [],
  };

  for (const inv of invoices) {
    const daysOverdue = inv.dueDate
      ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000)
      : 0;
    const enriched = { ...inv, daysOverdue };
    if (daysOverdue <= 0) buckets.current.push(enriched);
    else if (daysOverdue <= 30) buckets.days1_30.push(enriched);
    else if (daysOverdue <= 60) buckets.days31_60.push(enriched);
    else if (daysOverdue <= 90) buckets.days61_90.push(enriched);
    else buckets.days90plus.push(enriched);
  }

  return buckets;
}),
```

**Step 3: Add `timeTracking` query**

```ts
timeTracking: protectedProcedure
  .input(dateRangeSchema)
  .query(async ({ ctx, input }) => {
    const entries = await ctx.db.timeEntry.findMany({
      where: {
        organizationId: ctx.orgId,
        ...(input.from || input.to
          ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
          : {}),
      },
      include: {
        project: { select: { id: true, name: true, rate: true, client: { select: { name: true } } } },
      },
    });

    const byProject = new Map<string, { projectId: string; projectName: string; clientName: string; totalMinutes: number; billableAmount: number }>();

    for (const e of entries) {
      const key = e.projectId;
      if (!byProject.has(key)) {
        byProject.set(key, {
          projectId: e.projectId,
          projectName: e.project.name,
          clientName: e.project.client.name,
          totalMinutes: 0,
          billableAmount: 0,
        });
      }
      const row = byProject.get(key)!;
      const mins = Number(e.minutes);
      row.totalMinutes += mins;
      row.billableAmount += (mins / 60) * Number(e.project.rate);
    }

    return Array.from(byProject.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }),
```

**Step 4: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat(api): add profitLoss, invoiceAging, and timeTracking report queries"
```

---

## Task 5: Invoice CSV export API route

**Files:**
- Create: `src/app/api/reports/invoices/export/route.ts`

**Step 1: Create the file**

```ts
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const dbUser = await db.user.findUnique({
    where: { supabaseId: user.id },
    select: { organizationId: true },
  });
  if (!dbUser) return new Response("Unauthorized", { status: 401 });

  const invoices = await db.invoice.findMany({
    where: { organizationId: dbUser.organizationId, isArchived: false },
    include: {
      client: { select: { name: true } },
      currency: { select: { symbol: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { date: "desc" },
  });

  const headers = ["Number", "Type", "Status", "Client", "Date", "Due Date", "Subtotal", "Tax", "Total", "Paid", "Balance"];
  const rows = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(inv.total) - paid;
    return [
      inv.number,
      inv.type,
      inv.status,
      inv.client.name,
      inv.date.toISOString().slice(0, 10),
      inv.dueDate?.toISOString().slice(0, 10) ?? "",
      Number(inv.subtotal).toFixed(2),
      Number(inv.taxTotal).toFixed(2),
      Number(inv.total).toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
    ].map(escapeCsv).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invoices-${date}.csv"`,
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/reports/invoices/export/route.ts
git commit -m "feat(api): add invoice CSV export endpoint"
```

---

## Task 6: P&L report page

**Files:**
- Create: `src/app/(dashboard)/reports/profit-loss/page.tsx`
- Create: `src/app/(dashboard)/reports/profit-loss/loading.tsx`

**Step 1: Create loading skeleton**

```tsx
// src/app/(dashboard)/reports/profit-loss/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="rounded-2xl border border-border/50 bg-card h-32" />
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}
```

**Step 2: Create the page**

```tsx
// src/app/(dashboard)/reports/profit-loss/page.tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortMonth(key: string) {
  return MONTH_NAMES[parseInt(key.split("-")[1], 10) - 1] ?? "";
}

export default async function ProfitLossPage() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
  const data = await api.reports.profitLoss({ from });

  const months = Array.from(
    new Set([...Object.keys(data.revenueByMonth), ...Object.keys(data.expensesByMonth)])
  ).sort().slice(-12);

  const maxVal = Math.max(...months.flatMap((m) => [data.revenueByMonth[m] ?? 0, data.expensesByMonth[m] ?? 0]), 1);
  const CHART_H = 100;
  const BAR_W = 14;
  const GROUP_GAP = 6;
  const BAR_GAP = 2;
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const totalW = months.length * GROUP_W - GROUP_GAP;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
      </div>

      {/* Summary cards */}
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

      {/* Chart */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5">
        <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
        <div className="overflow-x-auto">
          <svg width={totalW} height={CHART_H + 28} viewBox={`0 0 ${totalW} ${CHART_H + 28}`}>
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

      {/* Monthly table */}
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

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/profit-loss/
git commit -m "feat(ui): add profit & loss report page"
```

---

## Task 7: Invoice aging report page

**Files:**
- Create: `src/app/(dashboard)/reports/aging/page.tsx`
- Create: `src/app/(dashboard)/reports/aging/loading.tsx`

**Step 1: Create loading skeleton**

```tsx
// src/app/(dashboard)/reports/aging/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card h-20" />
        ))}
      </div>
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}
```

**Step 2: Create the page**

```tsx
// src/app/(dashboard)/reports/aging/page.tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function fmt(n: number | { toNumber(): number }) {
  return typeof n === "object" ? n.toNumber().toFixed(2) : n.toFixed(2);
}

export default async function AgingPage() {
  const data = await api.reports.invoiceAging();

  const buckets = [
    { key: "current" as const, label: "Current", color: "text-emerald-600", bgColor: "bg-emerald-50" },
    { key: "days1_30" as const, label: "1–30 days", color: "text-amber-600", bgColor: "bg-amber-50" },
    { key: "days31_60" as const, label: "31–60 days", color: "text-orange-600", bgColor: "bg-orange-50" },
    { key: "days61_90" as const, label: "61–90 days", color: "text-red-500", bgColor: "bg-red-50" },
    { key: "days90plus" as const, label: "90+ days", color: "text-red-700", bgColor: "bg-red-100" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Invoice Aging</h1>
      </div>

      {/* Summary buckets */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {buckets.map((b) => {
          const items = data[b.key];
          const total = items.reduce((s, i) => s + Number(i.total), 0);
          return (
            <div key={b.key} className="rounded-2xl border border-border/50 bg-card px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{b.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${b.color}`}>${total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{items.length} invoice{items.length !== 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>

      {/* Per-bucket tables */}
      {buckets.map((b) => {
        const items = data[b.key];
        if (items.length === 0) return null;
        return (
          <div key={b.key} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className={`px-5 py-3 border-b border-border/50 flex items-center gap-2`}>
              <span className={`w-2 h-2 rounded-full ${b.bgColor.replace("bg-", "bg-")}`} />
              <p className="text-sm font-semibold">{b.label}</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2 text-left">Invoice</th>
                  <th className="px-5 py-2 text-left">Client</th>
                  <th className="px-5 py-2 text-right">Due Date</th>
                  <th className="px-5 py-2 text-right">Days Overdue</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                    <td className="px-5 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:text-primary transition-colors">
                        #{inv.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{inv.client.name}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${b.color}`}>
                      {inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {inv.currency.symbol}{fmt(inv.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/aging/
git commit -m "feat(ui): add invoice aging report page"
```

---

## Task 8: Time tracking report page

**Files:**
- Create: `src/app/(dashboard)/reports/time/page.tsx`
- Create: `src/app/(dashboard)/reports/time/loading.tsx`

**Step 1: Create loading skeleton**

```tsx
// src/app/(dashboard)/reports/time/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="rounded-2xl border border-border/50 bg-card h-64" />
    </div>
  );
}
```

**Step 2: Create the page**

```tsx
// src/app/(dashboard)/reports/time/page.tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function TimeTrackingReportPage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const data = await api.reports.timeTracking({ from });

  const totalMinutes = data.reduce((s, r) => s + r.totalMinutes, 0);
  const totalBillable = data.reduce((s, r) => s + r.billableAmount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Time Tracking</h1>
      </div>

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
          No time entries this month.
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

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/time/
git commit -m "feat(ui): add time tracking report page"
```

---

## Task 9: Update reports index page

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`

**Step 1: Add new report entries to the `reports` array**

Add after the existing three entries in the `reports` array:

```ts
{
  href: "/reports/profit-loss",
  label: "Profit & Loss",
  description: "Net income breakdown with revenue vs. expenses by month.",
  icon: <TrendingUp className="w-4 h-4" />,
  color: "bg-blue-50 text-blue-600",
},
{
  href: "/reports/aging",
  label: "Invoice Aging",
  description: "Outstanding invoices bucketed by days overdue.",
  icon: <Clock className="w-4 h-4" />,
  color: "bg-red-50 text-red-600",
},
{
  href: "/reports/time",
  label: "Time Tracking",
  description: "Hours logged and billable totals by project.",
  icon: <Timer className="w-4 h-4" />,
  color: "bg-cyan-50 text-cyan-600",
},
```

**Step 2: Add import for new icons**

Update the lucide-react import to include `TrendingUp`, `Clock`, `Timer`.

**Step 3: Add invoice export button**

In the page header (`flex items-center justify-between`), add:

```tsx
<a
  href="/api/reports/invoices/export"
  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-3 py-1.5 transition-colors"
>
  <Download className="w-3.5 h-3.5" />
  Export Invoices CSV
</a>
```

Add `Download` to the lucide-react import.

**Step 4: Change grid from `sm:grid-cols-3` to `sm:grid-cols-3` (already 3, now 6 — update to `sm:grid-cols-2 lg:grid-cols-3`)**

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat(ui): add P&L, aging, time report links and invoice CSV export to reports page"
```

---

## Task 10: Invoice comment email template

**Files:**
- Create: `src/emails/InvoiceCommentEmail.tsx`

**Step 1: Create the template**

Look at `src/emails/InvoiceViewedEmail.tsx` for the exact style/component pattern, then create:

```tsx
import {
  Html, Head, Body, Container, Section, Text, Button, Hr, Preview,
} from "@react-email/components";

type Props = {
  invoiceNumber: string;
  clientName: string;
  authorName: string;
  commentBody: string;
  orgName: string;
  invoiceLink: string;
};

export function InvoiceCommentEmail({ invoiceNumber, clientName, authorName, commentBody, orgName, invoiceLink }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{authorName} commented on Invoice #{invoiceNumber}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif" }}>
        <Container style={{ maxWidth: 560, margin: "40px auto", backgroundColor: "#ffffff", borderRadius: 8, padding: "32px 40px" }}>
          <Text style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
            New comment on Invoice #{invoiceNumber}
          </Text>
          <Text style={{ color: "#6b7280", marginTop: 0 }}>
            {authorName} ({clientName}) left a comment:
          </Text>
          <Section style={{ backgroundColor: "#f3f4f6", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }}>
            <Text style={{ color: "#111827", margin: 0 }}>{commentBody}</Text>
          </Section>
          <Button
            href={invoiceLink}
            style={{ backgroundColor: "#2563eb", color: "#ffffff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", display: "inline-block", fontWeight: 600 }}
          >
            View Invoice
          </Button>
          <Hr style={{ margin: "24px 0", borderColor: "#e5e7eb" }} />
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            {orgName} · Reply by visiting the invoice in your dashboard.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

**Step 2: Commit**

```bash
git add src/emails/InvoiceCommentEmail.tsx
git commit -m "feat(email): add InvoiceCommentEmail template"
```

---

## Task 11: Portal addComment — trigger email + in-app notification

**Files:**
- Modify: `src/server/routers/portal.ts`

**Step 1: Expand the `addComment` mutation to fetch org user emails and notify**

The current `addComment` mutation returns immediately after creating the comment. Extend it:

1. Change the invoice select to include org users and invoice number:

```ts
const invoice = await ctx.db.invoice.findUnique({
  where: { portalToken: input.token },
  select: {
    id: true,
    number: true,
    organizationId: true,
    organization: {
      select: {
        name: true,
        users: { select: { email: true, supabaseId: true, id: true } },
      },
    },
  },
});
```

2. After creating the comment, fire notifications (non-fatal — wrap in try/catch):

```ts
// Fire-and-forget notifications (non-fatal)
try {
  const { Resend } = await import("resend");
  const { render } = await import("@react-email/render");
  const { InvoiceCommentEmail } = await import("@/emails/InvoiceCommentEmail");
  const { notifyOrgAdmins } = await import("@/server/services/notifications");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invoiceLink = `${appUrl}/invoices/${invoice.id}`;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = await render(
    InvoiceCommentEmail({
      invoiceNumber: invoice.number,
      clientName: input.authorName,
      authorName: input.authorName,
      commentBody: input.body,
      orgName: invoice.organization.name,
      invoiceLink,
    }),
  );

  await Promise.all(
    invoice.organization.users
      .filter((u) => u.email)
      .map((u) =>
        resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: u.email,
          subject: `New comment on Invoice #${invoice.number} from ${input.authorName}`,
          html,
        }),
      ),
  );

  await notifyOrgAdmins(invoice.organizationId, {
    type: "INVOICE_COMMENT",
    title: `New comment on Invoice #${invoice.number}`,
    body: `${input.authorName}: ${input.body.slice(0, 100)}${input.body.length > 100 ? "…" : ""}`,
    link: `/invoices/${invoice.id}`,
  });
} catch {
  // Notification failure is non-fatal
}
```

**Step 2: Commit**

```bash
git add src/server/routers/portal.ts
git commit -m "feat(notifications): email + in-app alert to org when client comments on invoice"
```

---

## Task 12: OrgSettingsForm — payment terms + reminder days

**Files:**
- Modify: `src/components/settings/OrgSettingsForm.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Update `Org` type in OrgSettingsForm**

Add to the `Org` type:
```ts
defaultPaymentTermsDays: number;
paymentReminderDays: number[];
```

**Step 2: Add to form state**

```ts
defaultPaymentTermsDays: org.defaultPaymentTermsDays,
paymentReminderDays: org.paymentReminderDays,
```

**Step 3: Add payment terms dropdown**

Add a new form section after Task Time Interval:

```tsx
const PAYMENT_TERM_OPTIONS = [
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 14", days: 14 },
  { label: "Net 15", days: 15 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
  { label: "Net 60", days: 60 },
  { label: "Net 90", days: 90 },
];

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
```

Payment terms section in JSX:

```tsx
<div>
  <label className="text-sm font-medium">Default Payment Terms</label>
  <select
    value={PAYMENT_TERM_OPTIONS.find(o => o.days === form.defaultPaymentTermsDays)?.days ?? form.defaultPaymentTermsDays}
    onChange={(e) => setForm((p) => ({ ...p, defaultPaymentTermsDays: parseInt(e.target.value) }))}
    className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
  >
    {PAYMENT_TERM_OPTIONS.map((o) => (
      <option key={o.days} value={o.days}>{o.label}</option>
    ))}
    {!PAYMENT_TERM_OPTIONS.find(o => o.days === form.defaultPaymentTermsDays) && (
      <option value={form.defaultPaymentTermsDays}>Net {form.defaultPaymentTermsDays}</option>
    )}
  </select>
  <p className="text-xs text-muted-foreground mt-1">
    New invoices will have their due date set automatically from the invoice date.
  </p>
</div>
```

Reminder days section in JSX:

```tsx
<div>
  <label className="text-sm font-medium">Send Payment Reminders</label>
  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
    Send reminder emails this many days before an invoice is due.
  </p>
  <div className="flex flex-wrap gap-2">
    {REMINDER_DAY_OPTIONS.map((d) => (
      <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.paymentReminderDays.includes(d)}
          onChange={(e) => {
            setForm((p) => ({
              ...p,
              paymentReminderDays: e.target.checked
                ? [...p.paymentReminderDays, d].sort((a, b) => a - b)
                : p.paymentReminderDays.filter((x) => x !== d),
            }));
          }}
          className="rounded"
        />
        {d === 1 ? "1 day" : `${d} days`}
      </label>
    ))}
  </div>
</div>
```

**Step 4: Update the mutation call to include new fields**

In `handleSubmit`, add to the `updateMutation.mutate({...})` call:
```ts
defaultPaymentTermsDays: form.defaultPaymentTermsDays,
paymentReminderDays: form.paymentReminderDays,
```

**Step 5: Update settings page to pass new fields**

In `src/app/(dashboard)/settings/page.tsx`, update the `api.organization.get()` call and pass the new fields to `OrgSettingsForm`.

**Step 6: Commit**

```bash
git add src/components/settings/OrgSettingsForm.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(ui): add payment terms and reminder day settings to org settings form"
```

---

## Task 13: ClientForm — default payment terms

**Files:**
- Modify: `src/components/clients/ClientForm.tsx`

**Step 1: Update the `Client` type to include the new field**

```ts
defaultPaymentTermsDays: number | null;
```

**Step 2: Add to form state**

```ts
defaultPaymentTermsDays: client?.defaultPaymentTermsDays ?? null,
```

**Step 3: Add payment terms dropdown to the form JSX**

The UI should offer "Use org default" as the null option. Place it after the Notes field:

```tsx
const PAYMENT_TERM_OPTIONS = [
  { label: "Use org default", days: null },
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 14", days: 14 },
  { label: "Net 15", days: 15 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
  { label: "Net 60", days: 60 },
  { label: "Net 90", days: 90 },
];
```

```tsx
<div>
  <label className="text-sm font-medium">Default Payment Terms</label>
  <select
    value={form.defaultPaymentTermsDays ?? ""}
    onChange={(e) =>
      setForm((p) => ({
        ...p,
        defaultPaymentTermsDays: e.target.value === "" ? null : parseInt(e.target.value),
      }))
    }
    className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
  >
    {PAYMENT_TERM_OPTIONS.map((o) => (
      <option key={o.days ?? "null"} value={o.days ?? ""}>{o.label}</option>
    ))}
  </select>
</div>
```

**Step 4: Include in mutation call**

The field passes automatically via the spread in the submit handler since it's in the form state — verify it's included in the data object sent to `createMutation` / `updateMutation`.

**Step 5: Commit**

```bash
git add src/components/clients/ClientForm.tsx
git commit -m "feat(ui): add default payment terms to client form"
```

---

## Task 14: InvoiceForm — auto-populate due date + reminder override

**Files:**
- Modify: `src/components/invoices/InvoiceForm.tsx`

The `Props` type needs the org and selected client's payment terms. Update the `Props` type:

```ts
orgPaymentTermsDays: number;
clients: { id: string; name: string; defaultPaymentTermsDays: number | null }[];
```

**Step 1: Auto-populate dueDate when client changes**

Add a handler that fires when `clientId` changes:

```ts
function handleClientChange(clientId: string) {
  const client = clients.find((c) => c.id === clientId);
  const termsDays = client?.defaultPaymentTermsDays ?? orgPaymentTermsDays;
  const dueDate = new Date(form.date);
  dueDate.setDate(dueDate.getDate() + termsDays);
  setForm((p) => ({
    ...p,
    clientId,
    dueDate: termsDays === 0 ? form.date : dueDate.toISOString().slice(0, 10),
  }));
}
```

Call `handleClientChange` in the client `<Select>` `onValueChange` instead of setting `clientId` directly.

**Step 2: Add `reminderDaysOverride` to form state**

```ts
reminderDaysOverride: initialData?.reminderDaysOverride ?? [],
```

Add the type to `InvoiceFormData`:
```ts
reminderDaysOverride: number[];
```

**Step 3: Add reminder override UI**

Add a collapsible section below the Notes field:

```tsx
const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];
const [useCustomReminders, setUseCustomReminders] = useState(
  (initialData?.reminderDaysOverride?.length ?? 0) > 0
);
```

```tsx
<div>
  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
    <input
      type="checkbox"
      checked={!useCustomReminders}
      onChange={(e) => {
        setUseCustomReminders(!e.target.checked);
        if (e.target.checked) setForm((p) => ({ ...p, reminderDaysOverride: [] }));
      }}
      className="rounded"
    />
    Use org default reminder schedule
  </label>
  {useCustomReminders && (
    <div className="mt-2 flex flex-wrap gap-2 pl-1">
      {REMINDER_DAY_OPTIONS.map((d) => (
        <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.reminderDaysOverride.includes(d)}
            onChange={(e) => {
              setForm((p) => ({
                ...p,
                reminderDaysOverride: e.target.checked
                  ? [...p.reminderDaysOverride, d].sort((a, b) => a - b)
                  : p.reminderDaysOverride.filter((x) => x !== d),
              }));
            }}
            className="rounded"
          />
          {d === 1 ? "1 day" : `${d} days`}
        </label>
      ))}
    </div>
  )}
</div>
```

**Step 4: Pass `reminderDaysOverride` in the mutation call**

Add `reminderDaysOverride: form.reminderDaysOverride` to both `create` and `update` mutation inputs.

**Step 5: Update invoices router to accept `reminderDaysOverride`**

In `src/server/routers/invoices.ts`, add `reminderDaysOverride: z.array(z.number().int().min(1)).optional()` to both create and update input schemas.

**Step 6: Update invoice new/edit pages to pass `orgPaymentTermsDays` and updated clients prop**

The `new/page.tsx` and `[id]/page.tsx` pages that render `InvoiceForm` need to:
- Fetch `org.defaultPaymentTermsDays` (already fetched via `api.organization.get()` or add if missing)
- Pass it as `orgPaymentTermsDays`
- Include `defaultPaymentTermsDays` in the clients list query

**Step 7: Commit**

```bash
git add src/components/invoices/InvoiceForm.tsx src/server/routers/invoices.ts
git commit -m "feat(ui): auto-populate invoice due date from payment terms and add reminder override"
```

---

## Task 15: Update payment reminders cron

**Files:**
- Modify: `src/inngest/functions/payment-reminders.ts`

**Step 1: Replace the hardcoded date window with configurable logic**

Replace the entire function body with:

```ts
async () => {
  const now = new Date();

  // Load all upcoming invoices with their org's reminder config
  const ninetyDaysOut = new Date(now);
  ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["SENT", "PARTIALLY_PAID"] },
      dueDate: { gte: tomorrow, lte: ninetyDaysOut },
      type: { in: ["SIMPLE", "DETAILED"] },
      isArchived: false,
    },
    include: {
      client: true,
      currency: true,
      organization: {
        select: { name: true, paymentReminderDays: true },
      },
    },
  });

  // Filter to only invoices where today is a reminder day
  const eligible = invoices.filter((invoice) => {
    const daysUntilDue = calcDaysUntilDue(now, invoice.dueDate!);
    const effectiveDays =
      invoice.reminderDaysOverride.length > 0
        ? invoice.reminderDaysOverride
        : invoice.organization.paymentReminderDays;
    return effectiveDays.includes(daysUntilDue);
  });

  const results = await Promise.allSettled(
    eligible.map(async (invoice) => {
      if (!invoice.client.email) return;

      const daysUntilDue = calcDaysUntilDue(now, invoice.dueDate!);
      const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

      const { Resend } = await import("resend");
      const { render } = await import("@react-email/render");
      const { PaymentReminderEmail } = await import("@/emails/PaymentReminderEmail");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const html = await render(
        PaymentReminderEmail({
          invoiceNumber: invoice.number,
          clientName: invoice.client.name,
          total: invoice.total.toFixed(2),
          currencySymbol: invoice.currency.symbol,
          dueDate: invoice.dueDate!.toLocaleDateString(),
          orgName: invoice.organization.name,
          portalLink,
          daysUntilDue,
        }),
      );

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
        to: invoice.client.email,
        subject: `Payment reminder — Invoice #${invoice.number} due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`,
        html,
      });
    }),
  );

  return {
    scanned: invoices.length,
    processed: eligible.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
},
```

**Step 2: Commit**

```bash
git add src/inngest/functions/payment-reminders.ts
git commit -m "feat(inngest): configurable payment reminder days per org and per invoice"
```

---

## Final: Push

```bash
git push
```

Verify in Inngest dashboard that the payment-reminders function still shows as registered. Verify new report pages load at `/reports/profit-loss`, `/reports/aging`, `/reports/time`. Test the CSV export via the button on `/reports`.
