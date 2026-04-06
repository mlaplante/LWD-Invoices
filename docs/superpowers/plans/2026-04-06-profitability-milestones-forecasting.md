# Profitability, Milestone Auto-Drafting & Revenue Forecasting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three features — profitability reports per client/project, auto-draft invoices on milestone completion, and pipeline-based revenue forecasting.

**Architecture:** Feature 1 and 3 are new tRPC report procedures + server-component pages following the existing `profitLoss` pattern. Feature 2 adds schema fields to Milestone, a new `complete` mutation, and invoice-generation logic inside a transaction. All three features are independent and can be built in parallel.

**Tech Stack:** Next.js 16 (App Router, server components), tRPC v11, Prisma 7, TypeScript, Tailwind v4, shadcn/ui, lucide-react

---

## File Map

### Feature 1: Profitability Reports
- **Modify:** `src/server/routers/reports.ts` — add `profitabilityByClient` and `profitabilityByProject` procedures
- **Create:** `src/app/(dashboard)/reports/profitability/page.tsx` — profitability report page
- **Modify:** `src/app/(dashboard)/reports/page.tsx` — add nav card

### Feature 2: Milestone Auto-Drafting
- **Modify:** `prisma/schema.prisma` — add fields to Milestone, add relation to Invoice
- **Modify:** `src/server/routers/milestones.ts` — update create/update inputs, add `complete` mutation
- **Modify:** `src/components/projects/MilestoneForm.tsx` — add amount + autoInvoice fields
- **Create:** `src/components/projects/MilestoneList.tsx` — milestone list with complete/reopen actions
- **Modify:** `src/app/(dashboard)/projects/[id]/page.tsx` — add milestones tab

### Feature 3: Revenue Forecasting
- **Modify:** `src/server/routers/reports.ts` — add `revenueForecast` procedure
- **Create:** `src/app/(dashboard)/reports/forecast/page.tsx` — forecast report page
- **Modify:** `src/app/(dashboard)/reports/page.tsx` — add nav card

---

## Task 1: Profitability-by-Client Procedure

**Files:**
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Add `profitabilityByClient` procedure**

Add this procedure to the reports router in `src/server/routers/reports.ts`, after the `profitLoss` procedure (after line ~277):

```ts
  profitabilityByClient: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;

      // Revenue: payments grouped by invoice's clientId
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(dateFilter ? { paidAt: dateFilter } : {}),
        },
        select: {
          amount: true,
          invoice: { select: { clientId: true } },
        },
      });

      // Costs: expenses via project.clientId + time entry cost via project
      const [expenses, timeEntries] = await Promise.all([
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            project: { isNot: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: {
            rate: true,
            qty: true,
            project: { select: { clientId: true } },
          },
        }),
        ctx.db.timeEntry.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: {
            minutes: true,
            project: { select: { clientId: true, rate: true } },
          },
        }),
      ]);

      // Client names
      const clients = await ctx.db.client.findMany({
        where: { organizationId: ctx.orgId },
        select: { id: true, name: true },
      });
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));

      // Aggregate by clientId
      const revenueByClient: Record<string, number> = {};
      for (const p of payments) {
        const cid = p.invoice.clientId;
        revenueByClient[cid] = (revenueByClient[cid] ?? 0) + Number(p.amount);
      }

      const costByClient: Record<string, number> = {};
      for (const e of expenses) {
        if (!e.project) continue;
        const cid = e.project.clientId;
        costByClient[cid] = (costByClient[cid] ?? 0) + Number(e.rate) * e.qty;
      }
      for (const t of timeEntries) {
        if (!t.project) continue;
        const cid = t.project.clientId;
        const hours = Number(t.minutes) / 60;
        costByClient[cid] = (costByClient[cid] ?? 0) + hours * Number(t.project.rate);
      }

      const allClientIds = Array.from(
        new Set([...Object.keys(revenueByClient), ...Object.keys(costByClient)])
      );

      const rows = allClientIds.map((cid) => {
        const revenue = revenueByClient[cid] ?? 0;
        const costs = costByClient[cid] ?? 0;
        const margin = revenue - costs;
        return {
          clientId: cid,
          clientName: clientMap.get(cid) ?? "Unknown",
          revenue: Math.round(revenue * 100) / 100,
          costs: Math.round(costs * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
        };
      });

      rows.sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
      const totalMargin = totalRevenue - totalCosts;

      return {
        rows,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalMargin: Math.round(totalMargin * 100) / 100,
        avgMarginPercent: totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 10000) / 100 : 0,
      };
    }),
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing ones unrelated to reports.ts)

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat: add profitabilityByClient report procedure"
```

---

## Task 2: Profitability-by-Project Procedure

**Files:**
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Add `profitabilityByProject` procedure**

Add after `profitabilityByClient` in reports.ts:

```ts
  profitabilityByProject: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;

      // Revenue: payments for invoices where line items link to a project
      // via TimeEntry.invoiceLineId or Expense.invoiceLineId
      const billedTime = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          invoiceLineId: { not: null },
          projectId: { not: null },
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        select: {
          projectId: true,
          invoiceLine: {
            select: {
              total: true,
              invoice: { select: { status: true } },
            },
          },
        },
      });

      const billedExpenses = await ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          invoiceLineId: { not: null },
          projectId: { not: null },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        select: {
          projectId: true,
          invoiceLine: {
            select: {
              total: true,
              invoice: { select: { status: true } },
            },
          },
        },
      });

      // Costs: all expenses + time entries by project
      const [allExpenses, allTime] = await Promise.all([
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            projectId: { not: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { projectId: true, rate: true, qty: true },
        }),
        ctx.db.timeEntry.findMany({
          where: {
            organizationId: ctx.orgId,
            projectId: { not: null },
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: {
            projectId: true,
            minutes: true,
            project: { select: { rate: true } },
          },
        }),
      ]);

      // Project names + client names
      const projects = await ctx.db.project.findMany({
        where: { organizationId: ctx.orgId },
        select: { id: true, name: true, client: { select: { name: true } } },
      });
      const projectMap = new Map(projects.map((p) => [p.id, { name: p.name, clientName: p.client.name }]));

      // Revenue by project (only from billed line items on paid/sent invoices)
      const revenueByProject: Record<string, number> = {};
      const paidStatuses = new Set(["PAID", "SENT", "PARTIALLY_PAID"]);
      for (const t of billedTime) {
        if (!t.projectId || !t.invoiceLine || !paidStatuses.has(t.invoiceLine.invoice.status)) continue;
        revenueByProject[t.projectId] = (revenueByProject[t.projectId] ?? 0) + Number(t.invoiceLine.total);
      }
      for (const e of billedExpenses) {
        if (!e.projectId || !e.invoiceLine || !paidStatuses.has(e.invoiceLine.invoice.status)) continue;
        revenueByProject[e.projectId] = (revenueByProject[e.projectId] ?? 0) + Number(e.invoiceLine.total);
      }

      // Costs by project
      const costByProject: Record<string, number> = {};
      for (const e of allExpenses) {
        if (!e.projectId) continue;
        costByProject[e.projectId] = (costByProject[e.projectId] ?? 0) + Number(e.rate) * e.qty;
      }
      for (const t of allTime) {
        if (!t.projectId) continue;
        const hours = Number(t.minutes) / 60;
        costByProject[t.projectId] = (costByProject[t.projectId] ?? 0) + hours * Number(t.project.rate);
      }

      const allProjectIds = Array.from(
        new Set([...Object.keys(revenueByProject), ...Object.keys(costByProject)])
      );

      const rows = allProjectIds.map((pid) => {
        const info = projectMap.get(pid);
        const revenue = revenueByProject[pid] ?? 0;
        const costs = costByProject[pid] ?? 0;
        const margin = revenue - costs;
        return {
          projectId: pid,
          projectName: info?.name ?? "Unknown",
          clientName: info?.clientName ?? "Unknown",
          revenue: Math.round(revenue * 100) / 100,
          costs: Math.round(costs * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
        };
      });

      rows.sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
      const totalMargin = totalRevenue - totalCosts;

      return {
        rows,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalMargin: Math.round(totalMargin * 100) / 100,
        avgMarginPercent: totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 10000) / 100 : 0,
      };
    }),
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat: add profitabilityByProject report procedure"
```

---

## Task 3: Profitability Report Page

**Files:**
- Create: `src/app/(dashboard)/reports/profitability/page.tsx`

- [ ] **Step 1: Create the profitability report page**

Create `src/app/(dashboard)/reports/profitability/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const TABS = ["client", "project"] as const;
type Tab = (typeof TABS)[number];

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "project" ? "project" : "client";
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const [clientData, projectData, org] = await Promise.all([
    tab === "client" ? api.reports.profitabilityByClient({ from, to }) : null,
    tab === "project" ? api.reports.profitabilityByProject({ from, to }) : null,
    api.organization.get(),
  ]);

  const data = tab === "client" ? clientData! : projectData!;

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Profitability"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={dateRange}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Profitability</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit print:hidden">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/reports/profitability?tab=${t}${params.from ? `&from=${params.from}` : ""}${params.to ? `&to=${params.to}` : ""}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            By {t === "client" ? "Client" : "Project"}
          </Link>
        ))}
      </div>

      <ReportFilters basePath="/reports/profitability" from={params.from} to={params.to}>
        <input type="hidden" name="tab" value={tab} />
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: data.totalRevenue, color: "text-emerald-600" },
          { label: "Total Costs", value: data.totalCosts, color: "text-red-600" },
          { label: "Total Margin", value: data.totalMargin, color: data.totalMargin >= 0 ? "text-primary" : "text-red-600" },
          { label: "Avg Margin %", value: null, pct: data.avgMarginPercent, color: data.avgMarginPercent >= 0 ? "text-primary" : "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>
              {s.pct !== undefined ? `${s.pct}%` : `$${s.value!.toFixed(2)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No data for the selected period.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 text-left">
                  {tab === "client" ? "Client" : "Project"}
                </th>
                {tab === "project" && (
                  <th className="px-5 py-3 text-left">Client</th>
                )}
                <th className="px-5 py-3 text-right">Revenue</th>
                <th className="px-5 py-3 text-right">Costs</th>
                <th className="px-5 py-3 text-right">Margin</th>
                <th className="px-5 py-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: Record<string, unknown>) => {
                const name = (tab === "client" ? row.clientName : row.projectName) as string;
                const margin = row.margin as number;
                return (
                  <tr
                    key={(row.clientId ?? row.projectId) as string}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium">{name}</td>
                    {tab === "project" && (
                      <td className="px-5 py-3 text-muted-foreground">
                        {row.clientName as string}
                      </td>
                    )}
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-600">
                      ${(row.revenue as number).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">
                      ${(row.costs as number).toFixed(2)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums font-semibold ${margin >= 0 ? "text-primary" : "text-red-600"}`}
                    >
                      ${margin.toFixed(2)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${(row.marginPercent as number) >= 0 ? "text-primary" : "text-red-600"}`}
                    >
                      {(row.marginPercent as number).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {tab === "project" && data.rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Note: Project revenue only includes amounts from billed time entries and expenses. Manually created invoice lines are attributed at the client level.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npx next build 2>&1 | tail -20` or visit `/reports/profitability` in dev mode.
Expected: Page renders with empty state ("No data for the selected period")

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/profitability/page.tsx
git commit -m "feat: add profitability report page with client/project tabs"
```

---

## Task 4: Add Profitability to Reports Navigation

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Add nav card for profitability report**

In `src/app/(dashboard)/reports/page.tsx`, add to the `reports` array (after the "Profit & Loss" entry at line ~33, before the closing `},`):

```tsx
  {
    href: "/reports/profitability",
    label: "Profitability",
    description: "Margin analysis by client and project.",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "bg-indigo-50 text-indigo-600",
  },
```

Note: `TrendingUp` is already imported. If you want a different icon, add `PieChart` from lucide-react:

```tsx
import { FileText, CreditCard, Receipt, ChevronRight, TrendingUp, Clock, Timer, Download, Scale, PieChart } from "lucide-react";
```

Then use `<PieChart className="w-4 h-4" />` as the icon.

- [ ] **Step 2: Verify the nav card appears**

Visit `/reports` in dev mode.
Expected: "Profitability" card appears in the grid.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add profitability to reports navigation"
```

---

## Task 5: Milestone Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new fields to Milestone model**

In `prisma/schema.prisma`, find the `Milestone` model and add these fields before `createdAt`:

```prisma
  amount         Decimal?   @db.Decimal(20, 10)
  completedAt    DateTime?
  autoInvoice    Boolean    @default(false)
  invoiceId      String?    @unique
  invoice        Invoice?   @relation(fields: [invoiceId], references: [id])
```

Also add the reverse relation to the `Invoice` model. Find `Invoice` and add:

```prisma
  milestone      Milestone?
```

- [ ] **Step 2: Generate and run the migration**

Run:
```bash
npx prisma migrate dev --name add-milestone-billing-fields
```

Expected: Migration created and applied. Prisma Client regenerated.

- [ ] **Step 3: Verify the schema compiles**

Run: `npx prisma validate`
Expected: "Prisma schema loaded successfully"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add billing fields to Milestone (amount, completedAt, autoInvoice, invoiceId)"
```

---

## Task 6: Milestone Complete Mutation

**Files:**
- Modify: `src/server/routers/milestones.ts`

- [ ] **Step 1: Update create and update input schemas to accept new fields**

In `src/server/routers/milestones.ts`, update the `create` input to include:

```ts
        amount: z.coerce.number().positive().optional(),
        autoInvoice: z.boolean().default(false),
```

And update the `update` input to include:

```ts
        amount: z.coerce.number().positive().optional().nullable(),
        autoInvoice: z.boolean().optional(),
```

- [ ] **Step 2: Add the `complete` mutation**

Add these imports at the top of the file:

```ts
import { generateInvoiceNumber } from "../services/invoice-numbering";
import { logAudit } from "../services/audit";
```

Add this new mutation after the `reorder` procedure:

```ts
  complete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { project: { include: { client: true } } },
      });
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });
      if (milestone.completedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone already completed" });
      }

      if (milestone.autoInvoice && milestone.amount) {
        // Create draft invoice inside a transaction
        const result = await ctx.db.$transaction(async (tx) => {
          const number = await generateInvoiceNumber(tx as never, ctx.orgId);

          const invoice = await tx.invoice.create({
            data: {
              number,
              type: "INVOICE",
              status: "DRAFT",
              date: new Date(),
              clientId: milestone.project.clientId,
              organizationId: ctx.orgId,
              subtotal: milestone.amount!,
              taxTotal: 0,
              discountTotal: 0,
              total: milestone.amount!,
              lines: {
                create: {
                  sort: 0,
                  lineType: "STANDARD",
                  name: milestone.name,
                  description: `Milestone: ${milestone.name}`,
                  qty: 1,
                  rate: milestone.amount!,
                  subtotal: milestone.amount!,
                  taxTotal: 0,
                  total: milestone.amount!,
                },
              },
            },
          });

          const updated = await tx.milestone.update({
            where: { id: input.id },
            data: { completedAt: new Date(), invoiceId: invoice.id },
          });

          await tx.auditLog.create({
            data: {
              action: "CREATED",
              entityType: "Invoice",
              entityId: invoice.id,
              entityLabel: invoice.number,
              organizationId: ctx.orgId,
              userId: ctx.userId,
            },
          });

          return { milestone: updated, invoice };
        });

        return result.milestone;
      }

      // No auto-invoice — just mark complete
      return ctx.db.milestone.update({
        where: { id: input.id },
        data: { completedAt: new Date() },
      });
    }),

  reopen: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });
      if (!milestone.completedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone is not completed" });
      }
      return ctx.db.milestone.update({
        where: { id: input.id },
        data: { completedAt: null },
      });
    }),
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/milestones.ts
git commit -m "feat: add milestone complete/reopen mutations with auto-invoice generation"
```

---

## Task 7: Update MilestoneForm with Billing Fields

**Files:**
- Modify: `src/components/projects/MilestoneForm.tsx`

- [ ] **Step 1: Add amount and autoInvoice fields to the form**

Replace the full content of `src/components/projects/MilestoneForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function MilestoneForm({ projectId, onSuccess, onCancel }: Props) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#3b82f6",
    targetDate: "",
    isViewable: false,
    amount: "",
    autoInvoice: false,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.milestones.create.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ projectId });
      utils.projects.get.invalidate({ id: projectId });
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      projectId,
      name: form.name,
      description: form.description || undefined,
      color: form.color,
      targetDate: form.targetDate ? new Date(form.targetDate) : undefined,
      isViewable: form.isViewable,
      amount: form.amount ? parseFloat(form.amount) : undefined,
      autoInvoice: form.autoInvoice,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Milestone name"
          required
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional description"
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <Input
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Target Date</label>
          <Input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Amount</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.amount}
          onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
          placeholder="Fixed price for this milestone"
          className="mt-1"
        />
      </div>

      {form.amount && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoInvoice}
            onChange={(e) => setForm((p) => ({ ...p, autoInvoice: e.target.checked }))}
          />
          Auto-create draft invoice on completion
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isViewable}
          onChange={(e) => setForm((p) => ({ ...p, isViewable: e.target.checked }))}
        />
        Visible to client
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create Milestone"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/MilestoneForm.tsx
git commit -m "feat: add amount and auto-invoice fields to MilestoneForm"
```

---

## Task 8: MilestoneList Component

**Files:**
- Create: `src/components/projects/MilestoneList.tsx`

- [ ] **Step 1: Create the MilestoneList component**

Create `src/components/projects/MilestoneList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { MilestoneForm } from "./MilestoneForm";
import { toast } from "sonner";
import { Check, RotateCcw, Plus, FileText } from "lucide-react";
import Link from "next/link";

type Props = { projectId: string };

export function MilestoneList({ projectId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();

  const { data: milestones, isLoading } = trpc.milestones.list.useQuery({ projectId });

  const completeMutation = trpc.milestones.complete.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ projectId });
      toast.success("Milestone completed");
    },
    onError: (err) => toast.error(err.message),
  });

  const reopenMutation = trpc.milestones.reopen.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ projectId });
      toast.success("Milestone reopened");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading milestones…</div>;
  }

  return (
    <div className="space-y-4">
      {milestones && milestones.length > 0 ? (
        <div className="space-y-2">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-medium text-sm ${m.completedAt ? "line-through text-muted-foreground" : ""}`}>
                    {m.name}
                  </p>
                  {m.amount && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ${Number(m.amount).toFixed(2)}
                    </span>
                  )}
                </div>
                {m.completedAt && (
                  <p className="text-xs text-muted-foreground">
                    Completed {new Date(m.completedAt).toLocaleDateString()}
                    {m.invoiceId && (
                      <>
                        {" · "}
                        <Link
                          href={`/invoices/${m.invoiceId}`}
                          className="text-primary hover:underline"
                        >
                          <FileText className="w-3 h-3 inline -mt-0.5" /> View Invoice
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {!m.completedAt && m.targetDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {new Date(m.targetDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!m.completedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => completeMutation.mutate({ id: m.id })}
                    disabled={completeMutation.isPending}
                  >
                    <Check className="w-3 h-3" />
                    Complete
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => reopenMutation.mutate({ id: m.id })}
                    disabled={reopenMutation.isPending}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No milestones yet.
          </div>
        )
      )}

      {showForm ? (
        <MilestoneForm
          projectId={projectId}
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Milestone
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/MilestoneList.tsx
git commit -m "feat: add MilestoneList component with complete/reopen actions"
```

---

## Task 9: Add Milestones Tab to Project Detail Page

**Files:**
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx`

- [ ] **Step 1: Add the milestones tab**

In `src/app/(dashboard)/projects/[id]/page.tsx`:

1. Add the import at the top:
```tsx
import { MilestoneList } from "@/components/projects/MilestoneList";
```

2. Add to the `TABS` array (after "tasks"):
```tsx
  { key: "milestones", label: "Milestones" },
```

3. Add the tab content in the tab rendering section (find where other tabs are rendered, e.g. `{tab === "tasks" && ...}`). Add:
```tsx
      {tab === "milestones" && <MilestoneList projectId={project.id} />}
```

- [ ] **Step 2: Verify the tab renders**

Visit a project detail page in dev mode and click the "Milestones" tab.
Expected: Tab renders with empty state or milestone list.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/projects/\[id\]/page.tsx
git commit -m "feat: add milestones tab to project detail page"
```

---

## Task 10: Revenue Forecast Procedure

**Files:**
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Add `revenueForecast` procedure**

First, add the import for `computeNextRunAt` at the top of `src/server/routers/reports.ts`:

```ts
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";
import { RecurringFrequency } from "@/generated/prisma";
```

Then add the procedure to the reports router:

```ts
  revenueForecast: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      // Calculate horizon end date
      const horizon = new Date(now);
      horizon.setUTCMonth(horizon.getUTCMonth() + input.months);

      // Step 1: Outstanding invoices (SENT + PARTIALLY_PAID)
      const openInvoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          status: { in: ["SENT", "PARTIALLY_PAID"] },
          isArchived: false,
        },
        select: {
          total: true,
          dueDate: true,
          payments: { select: { amount: true } },
        },
      });

      const outstandingByMonth: Record<string, number> = {};
      let overdueAmount = 0;

      for (const inv of openInvoices) {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Number(inv.total) - paid;
        if (remaining <= 0) continue;

        if (!inv.dueDate || inv.dueDate < now) {
          // Overdue — bucket in current month
          overdueAmount += remaining;
          outstandingByMonth[currentMonth] = (outstandingByMonth[currentMonth] ?? 0) + remaining;
        } else {
          const month = `${inv.dueDate.getUTCFullYear()}-${String(inv.dueDate.getUTCMonth() + 1).padStart(2, "0")}`;
          if (month <= `${horizon.getUTCFullYear()}-${String(horizon.getUTCMonth() + 1).padStart(2, "0")}`) {
            outstandingByMonth[month] = (outstandingByMonth[month] ?? 0) + remaining;
          }
        }
      }

      // Step 2: Recurring invoice projections
      const recurringInvoices = await ctx.db.recurringInvoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isActive: true,
        },
        select: {
          nextRunAt: true,
          frequency: true,
          interval: true,
          endDate: true,
          maxOccurrences: true,
          occurrenceCount: true,
          invoice: { select: { total: true } },
        },
      });

      const recurringByMonth: Record<string, number> = {};

      for (const rec of recurringInvoices) {
        let runAt = new Date(rec.nextRunAt);
        let count = rec.occurrenceCount;

        while (runAt <= horizon) {
          if (rec.endDate && runAt > rec.endDate) break;
          if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;

          const month = `${runAt.getUTCFullYear()}-${String(runAt.getUTCMonth() + 1).padStart(2, "0")}`;
          recurringByMonth[month] = (recurringByMonth[month] ?? 0) + Number(rec.invoice.total);

          runAt = computeNextRunAt(runAt, rec.frequency as RecurringFrequency, rec.interval);
          count++;
        }
      }

      // Build monthly buckets
      const allMonthKeys: string[] = [];
      const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      for (let i = 0; i < input.months; i++) {
        allMonthKeys.push(
          `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
        );
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }

      const months = allMonthKeys.map((month) => {
        const outstanding = Math.round((outstandingByMonth[month] ?? 0) * 100) / 100;
        const recurring = Math.round((recurringByMonth[month] ?? 0) * 100) / 100;
        return { month, outstanding, recurring, total: Math.round((outstanding + recurring) * 100) / 100 };
      });

      const totalOutstanding = months.reduce((s, m) => s + m.outstanding, 0);
      const totalRecurring = months.reduce((s, m) => s + m.recurring, 0);

      return {
        months,
        summary: {
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          totalRecurring: Math.round(totalRecurring * 100) / 100,
          grandTotal: Math.round((totalOutstanding + totalRecurring) * 100) / 100,
          overdueAmount: Math.round(overdueAmount * 100) / 100,
        },
      };
    }),
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat: add revenueForecast report procedure"
```

---

## Task 11: Revenue Forecast Page

**Files:**
- Create: `src/app/(dashboard)/reports/forecast/page.tsx`

- [ ] **Step 1: Create the forecast report page**

Create `src/app/(dashboard)/reports/forecast/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortMonth(key: string) {
  return MONTH_NAMES[parseInt(key.split("-")[1], 10) - 1] ?? "";
}

const HORIZON_OPTIONS = [3, 6, 12] as const;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const months = HORIZON_OPTIONS.includes(Number(params.months) as 3 | 6 | 12)
    ? (Number(params.months) as 3 | 6 | 12)
    : 6;

  const [data, org] = await Promise.all([
    api.reports.revenueForecast({ months }),
    api.organization.get(),
  ]);

  const max = Math.max(...data.months.map((m) => m.total), 1);
  const CHART_H = 100;
  const BAR_W = 14;
  const BAR_GAP = 2;
  const GROUP_GAP = 6;
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const totalW = data.months.length * GROUP_W - GROUP_GAP;

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Revenue Forecast"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`Next ${months} months`}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Forecast</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Horizon selector */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit print:hidden">
        {HORIZON_OPTIONS.map((h) => (
          <Link
            key={h}
            href={`/reports/forecast?months=${h}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              months === h
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {h} months
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Pipeline", value: data.summary.totalOutstanding, color: "text-blue-600" },
          { label: `Recurring (${months}mo)`, value: data.summary.totalRecurring, color: "text-emerald-600" },
          { label: "Combined Forecast", value: data.summary.grandTotal, color: "text-primary" },
          { label: "Overdue", value: data.summary.overdueAmount, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>
              ${s.value.toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Stacked bar chart */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5">
        <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
        {data.summary.grandTotal === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No forecasted revenue.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg
                width={totalW}
                height={CHART_H + 28}
                viewBox={`0 0 ${totalW} ${CHART_H + 28}`}
                style={{ display: "block" }}
              >
                {data.months.map((m, i) => {
                  const x = i * GROUP_W;
                  const outH = Math.max((m.outstanding / max) * CHART_H, m.outstanding > 0 ? 2 : 0);
                  const recH = Math.max((m.recurring / max) * CHART_H, m.recurring > 0 ? 2 : 0);
                  return (
                    <g key={m.month}>
                      <rect
                        x={x}
                        y={CHART_H - outH}
                        width={BAR_W}
                        height={outH}
                        rx={2}
                        fill="hsl(var(--primary) / 0.7)"
                      />
                      <rect
                        x={x + BAR_W + BAR_GAP}
                        y={CHART_H - recH}
                        width={BAR_W}
                        height={recH}
                        rx={2}
                        fill="hsl(142 71% 45% / 0.6)"
                      />
                      <text
                        x={x + BAR_W}
                        y={CHART_H + 18}
                        textAnchor="middle"
                        fontSize={9}
                        fill="hsl(var(--muted-foreground))"
                      >
                        {shortMonth(m.month)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/70 inline-block" />
                Outstanding
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: "hsl(142 71% 45% / 0.6)" }} />
                Recurring
              </span>
            </div>
          </>
        )}
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border/50">
            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 text-left">Month</th>
              <th className="px-5 py-3 text-right">Outstanding</th>
              <th className="px-5 py-3 text-right">Recurring</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-3 font-medium">
                  {shortMonth(m.month)} {m.month.split("-")[0]}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-blue-600">
                  ${m.outstanding.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-emerald-600">
                  ${m.recurring.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">
                  ${m.total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npx next build 2>&1 | tail -20` or visit `/reports/forecast` in dev mode.
Expected: Page renders with forecast data or empty state.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/forecast/page.tsx
git commit -m "feat: add revenue forecast report page"
```

---

## Task 12: Add Forecast to Reports Navigation

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Add nav card for forecast report**

In `src/app/(dashboard)/reports/page.tsx`, add to the `reports` array (after the Profitability entry added in Task 4). Also add the `BarChart3` icon import:

Update the import line:
```tsx
import { FileText, CreditCard, Receipt, ChevronRight, TrendingUp, Clock, Timer, Download, Scale, PieChart, BarChart3 } from "lucide-react";
```

Add to the `reports` array:
```tsx
  {
    href: "/reports/forecast",
    label: "Revenue Forecast",
    description: "Pipeline view of expected revenue over the next months.",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "bg-teal-50 text-teal-600",
  },
```

- [ ] **Step 2: Verify both new cards appear**

Visit `/reports` in dev mode.
Expected: Both "Profitability" and "Revenue Forecast" cards appear.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add forecast to reports navigation"
```
