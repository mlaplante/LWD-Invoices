# Tax-Ready Dashboard + Client Concentration Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new reports under `/reports` — a Tax-Ready Dashboard (sales tax due, income by category, deductible expenses, 1099 exposure, with period presets) and a Client Concentration report (revenue share + over-dependence risk).

**Architecture:** Pure compute functions (`computeConcentration`, `attributeIncomeByCategory`, `aggregateDeductibleExpenses`) that take already-fetched arrays — mirroring `services/ar-reports.ts` — wrapped by thin Prisma-fetching functions, surfaced through new tRPC `reports.*` procedures, rendered by server-component pages that reuse `ReportHeader`/`ReportFilters`/`PrintReportButton`. The cash-basis Tax Liability logic is extracted into a shared service so the dashboard and the existing report never drift.

**Tech Stack:** Next.js 16 (App Router, server components), tRPC v11, Prisma 7, Vitest, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-09-tax-dashboard-client-concentration-design.md`

---

## File Structure

**Create:**
- `src/server/services/client-concentration.ts` — `computeConcentration()` (pure) + `getClientConcentration()` (db)
- `src/server/services/income-by-category.ts` — `attributeIncomeByCategory()` (pure) + `getIncomeByCategory()` (db)
- `src/server/services/deductible-expenses.ts` — `aggregateDeductibleExpenses()` (pure) + `getDeductibleExpenses()` (db)
- `src/server/services/tax-liability.ts` — `getTaxLiability()` extracted from `reports.ts`
- `src/test/client-concentration.test.ts`
- `src/test/income-by-category.test.ts`
- `src/test/deductible-expenses.test.ts`
- `src/app/(dashboard)/reports/client-concentration/page.tsx`
- `src/app/(dashboard)/reports/tax-dashboard/page.tsx`

**Modify:**
- `src/components/reports/ReportFilters.tsx` — add "This Quarter" preset
- `prisma/schema.prisma` — `ExpenseCategory.deductible Boolean @default(true)` (+ migration)
- `src/server/routers/expenseCategories.ts` — accept `deductible` on create/update
- `src/components/settings/ExpenseCategoryManager.tsx` — deductible toggle column
- `src/server/routers/reports.ts` — replace inline `taxLiability` body with service call; add `taxDashboard` + `clientConcentration`
- `src/app/(dashboard)/reports/page.tsx` — two new nav cards

---

## Task 1: Add "This Quarter" preset to ReportFilters

The existing `ReportFilters` already has This Month / This Year / Last Year presets and writes `?from=&to=`. Both new pages reuse it as-is; it only lacks a quarter preset.

**Files:**
- Modify: `src/components/reports/ReportFilters.tsx`

- [ ] **Step 1: Add the "This Quarter" preset object**

In `src/components/reports/ReportFilters.tsx`, inside the `PRESETS` array, insert this object immediately **after** the "Last Month" entry and **before** "This Year":

```tsx
  {
    label: "This Quarter",
    getValue: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3); // 0..3
      const startMonth = q * 3;
      return {
        from: toLocalDateStr(new Date(now.getFullYear(), startMonth, 1)),
        to: toLocalDateStr(new Date(now.getFullYear(), startMonth + 3, 0)),
      };
    },
  },
```

- [ ] **Step 2: Verify it compiles / lints**

Run: `npx tsc --noEmit && npx eslint src/components/reports/ReportFilters.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/ReportFilters.tsx
git commit -m "feat(reports): add This Quarter preset to ReportFilters"
```

---

## Task 2: Client concentration pure compute function (TDD)

**Files:**
- Create: `src/server/services/client-concentration.ts`
- Test: `src/test/client-concentration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/client-concentration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeConcentration } from "@/server/services/client-concentration";

describe("computeConcentration", () => {
  it("returns an empty result when there is no revenue", () => {
    const r = computeConcentration([]);
    expect(r.rows).toEqual([]);
    expect(r.summary.totalRevenue).toBe(0);
    expect(r.summary.activeClients).toBe(0);
    expect(r.summary.topClientPct).toBe(0);
    expect(r.summary.hhi).toBe(0);
    expect(r.summary.riskLevel).toBe("ok");
    expect(r.summary.topClientName).toBeNull();
  });

  it("computes shares, cumulative shares, and sorts descending", () => {
    const r = computeConcentration([
      { clientId: "a", name: "Acme", revenue: 200 },
      { clientId: "b", name: "Beta", revenue: 600 },
      { clientId: "c", name: "Cyan", revenue: 200 },
    ]);
    expect(r.summary.totalRevenue).toBe(1000);
    expect(r.summary.activeClients).toBe(3);
    expect(r.rows[0]).toMatchObject({ clientId: "b", share: 60, cumulativeShare: 60 });
    expect(r.rows[1].cumulativeShare).toBeCloseTo(80, 5);
    expect(r.rows[2].cumulativeShare).toBeCloseTo(100, 5);
    expect(r.summary.topClientPct).toBe(60);
    expect(r.summary.topClientName).toBe("Beta");
  });

  it("computes top-3 / top-5 buckets without exceeding available clients", () => {
    const r = computeConcentration([
      { clientId: "a", name: "A", revenue: 50 },
      { clientId: "b", name: "B", revenue: 30 },
      { clientId: "c", name: "C", revenue: 20 },
    ]);
    expect(r.summary.top3Pct).toBeCloseTo(100, 5);
    expect(r.summary.top5Pct).toBeCloseTo(100, 5);
  });

  it("computes HHI as the sum of squared fractional shares times 10000", () => {
    // One client = 100% share -> HHI 10000 (monopoly).
    const mono = computeConcentration([{ clientId: "a", name: "A", revenue: 500 }]);
    expect(mono.summary.hhi).toBeCloseTo(10000, 5);
    expect(mono.summary.riskLevel).toBe("critical");
    // Two equal clients -> 0.5^2 + 0.5^2 = 0.5 -> 5000.
    const even = computeConcentration([
      { clientId: "a", name: "A", revenue: 100 },
      { clientId: "b", name: "B", revenue: 100 },
    ]);
    expect(even.summary.hhi).toBeCloseTo(5000, 5);
  });

  it("bands risk on the top client's share at the boundaries", () => {
    const at = (topPct: number) => {
      const rest = 100 - topPct;
      return computeConcentration([
        { clientId: "top", name: "Top", revenue: topPct },
        { clientId: "rest", name: "Rest", revenue: rest },
      ]).summary.riskLevel;
    };
    expect(at(50)).toBe("critical");
    expect(at(49)).toBe("high");
    expect(at(30)).toBe("high");
    expect(at(29)).toBe("watch");
    expect(at(15)).toBe("watch");
    expect(at(14)).toBe("ok");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/client-concentration.test.ts`
Expected: FAIL — cannot resolve `@/server/services/client-concentration`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/client-concentration.ts`:

```ts
export type ClientRevenue = { clientId: string; name: string; revenue: number };

export type ConcentrationRow = ClientRevenue & {
  share: number; // percent 0..100
  cumulativeShare: number; // percent 0..100, running total
};

export type RiskLevel = "ok" | "watch" | "high" | "critical";

export type ConcentrationSummary = {
  totalRevenue: number;
  activeClients: number;
  topClientPct: number;
  top3Pct: number;
  top5Pct: number;
  hhi: number; // 0..10000 Herfindahl-Hirschman Index
  riskLevel: RiskLevel;
  topClientName: string | null;
};

export type ConcentrationResult = {
  rows: ConcentrationRow[];
  summary: ConcentrationSummary;
};

function riskFromTopShare(topPct: number): RiskLevel {
  if (topPct >= 50) return "critical";
  if (topPct >= 30) return "high";
  if (topPct >= 15) return "watch";
  return "ok";
}

export function computeConcentration(clients: ClientRevenue[]): ConcentrationResult {
  const positive = clients.filter((c) => c.revenue > 0);
  const totalRevenue = positive.reduce((s, c) => s + c.revenue, 0);

  if (totalRevenue <= 0) {
    return {
      rows: [],
      summary: {
        totalRevenue: 0,
        activeClients: 0,
        topClientPct: 0,
        top3Pct: 0,
        top5Pct: 0,
        hhi: 0,
        riskLevel: "ok",
        topClientName: null,
      },
    };
  }

  const sorted = [...positive].sort((a, b) => b.revenue - a.revenue);

  let cumulative = 0;
  const rows: ConcentrationRow[] = sorted.map((c) => {
    const share = (c.revenue / totalRevenue) * 100;
    cumulative += share;
    return { ...c, share, cumulativeShare: cumulative };
  });

  const sumShares = (n: number) =>
    rows.slice(0, n).reduce((s, r) => s + r.share, 0);

  const hhi = sorted.reduce(
    (s, c) => s + (c.revenue / totalRevenue) ** 2,
    0,
  ) * 10000;

  const topClientPct = rows[0]?.share ?? 0;

  return {
    rows,
    summary: {
      totalRevenue,
      activeClients: rows.length,
      topClientPct,
      top3Pct: sumShares(3),
      top5Pct: sumShares(5),
      hhi,
      riskLevel: riskFromTopShare(topClientPct),
      topClientName: rows[0]?.name ?? null,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/client-concentration.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/client-concentration.ts src/test/client-concentration.test.ts
git commit -m "feat(reports): client concentration compute (shares, HHI, risk)"
```

---

## Task 3: Client concentration db wrapper + tRPC procedure

**Files:**
- Modify: `src/server/services/client-concentration.ts`
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Add the db-fetching wrapper**

Append to `src/server/services/client-concentration.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma";

type DateRange = { from?: Date; to?: Date };

/**
 * Cash-basis client concentration over a date range: each client's share is the
 * payments collected from their invoices divided by total payments collected.
 */
export async function getClientConcentration(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<ConcentrationResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const payments = await db.payment.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { paidAt: dateFilter } : {}),
    },
    select: {
      amount: true,
      invoice: {
        select: { clientId: true, client: { select: { name: true } } },
      },
    },
  });

  const byClient = new Map<string, ClientRevenue>();
  for (const p of payments) {
    const clientId = p.invoice.clientId;
    const existing = byClient.get(clientId);
    if (existing) {
      existing.revenue += Number(p.amount);
    } else {
      byClient.set(clientId, {
        clientId,
        name: p.invoice.client.name,
        revenue: Number(p.amount),
      });
    }
  }

  return computeConcentration(Array.from(byClient.values()));
}
```

> Note: `import type` at the bottom of the file is hoisted by TypeScript; if the project's eslint flags import position, move the `import type { PrismaClient }` line to the top of the file with the other imports.

- [ ] **Step 2: Wire the tRPC procedure**

In `src/server/routers/reports.ts`, add this import near the top with the other service imports (just below the `getArAgingAsOf` import):

```ts
import { getClientConcentration } from "@/server/services/client-concentration";
```

Then add this procedure inside `reportsRouter`, immediately after the `dsoTrend` procedure (before the closing `});` of the router):

```ts
  clientConcentration: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return getClientConcentration(ctx.db, ctx.orgId, input);
    }),
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/client-concentration.ts src/server/routers/reports.ts
git commit -m "feat(reports): clientConcentration procedure + db wrapper"
```

---

## Task 4: Client concentration page + nav card

**Files:**
- Create: `src/app/(dashboard)/reports/client-concentration/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(dashboard)/reports/client-concentration/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const RISK_COPY: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical concentration", cls: "bg-red-50 text-red-700 border-red-200" },
  high: { label: "High concentration", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  watch: { label: "Worth watching", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ok: { label: "Well diversified", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default async function ClientConcentrationReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const [data, org] = await Promise.all([
    api.reports.clientConcentration({ from, to }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const risk = RISK_COPY[data.summary.riskLevel];

  return (
    <div className="space-y-5">
      <ReportHeader title="Client Concentration" orgName={org.name} logoUrl={org.logoUrl} dateRange={dateRange} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/reports" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden">
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Client Concentration</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/client-concentration" from={params.from} to={params.to} />

      {data.summary.totalRevenue === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No payments recorded for the selected period.</p>
        </div>
      ) : (
        <>
          {/* Risk banner */}
          {data.summary.topClientName && (
            <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${risk.cls}`}>
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">{risk.label}</p>
                <p className="text-sm mt-0.5">
                  Top client <span className="font-semibold">{data.summary.topClientName}</span> is{" "}
                  {data.summary.topClientPct.toFixed(1)}% of revenue.
                </p>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Top Client</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.topClientPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Top 3 Clients</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.top3Pct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">HHI</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{Math.round(data.summary.hhi)}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Active Clients</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.activeClients}</p>
            </div>
          </div>

          {/* Revenue-share table */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detail</p>
              <p className="text-base font-semibold mt-0.5">Revenue Share by Client</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Share</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cumulative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.rows.map((r) => (
                    <tr key={r.clientId} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{r.name}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums">${r.revenue.toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(r.share, 100)}%` }} />
                          </div>
                          <span className="tabular-nums w-12 text-right">{r.share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">{r.cumulativeShare.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the nav card**

In `src/app/(dashboard)/reports/page.tsx`, add `Users` to the `lucide-react` import on line 3 (append `, Users` before the closing `}`). Then add this object to the `reports` array (place it right after the `client-health` entry):

```tsx
  {
    href: "/reports/client-concentration",
    label: "Client Concentration",
    description: "Revenue share per client with over-dependence risk indicators.",
    icon: <Users className="w-4 h-4" />,
    color: "bg-sky-50 text-sky-600",
  },
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/reports/client-concentration/page.tsx" "src/app/(dashboard)/reports/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/reports/client-concentration/page.tsx" "src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(reports): client concentration report page + nav card"
```

---

## Task 5: Add `deductible` to ExpenseCategory (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, in `model ExpenseCategory` (line ~979), add the field directly under `name`:

```prisma
model ExpenseCategory {
  id             String  @id @default(cuid())
  name           String
  deductible     Boolean @default(true)
  organizationId String
  // ...rest unchanged
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name expense_category_deductible`
Expected: a new migration is created under `prisma/migrations/` adding the `deductible` column with default `true`, and the Prisma client regenerates.

> If the dev database is unavailable, instead run `npx prisma migrate dev --create-only --name expense_category_deductible` to generate the SQL, then `npx prisma generate`. The generated SQL should be `ALTER TABLE "ExpenseCategory" ADD COLUMN "deductible" BOOLEAN NOT NULL DEFAULT true;`.

- [ ] **Step 3: Verify the client typed the field**

Run: `npx tsc --noEmit`
Expected: no errors (the generated `ExpenseCategory` type now includes `deductible`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(expenses): add deductible flag to ExpenseCategory"
```

---

## Task 6: Expose `deductible` in router + settings UI

`expenseCategories.list` uses `getExpenseCategoriesForOrg`, which does a `findMany` with no `select`, so `deductible` is returned automatically — no change needed there.

**Files:**
- Modify: `src/server/routers/expenseCategories.ts`
- Modify: `src/components/settings/ExpenseCategoryManager.tsx`

- [ ] **Step 1: Accept `deductible` on create + update**

In `src/server/routers/expenseCategories.ts`, change the `create` input and the `update` input:

```ts
  create: requireRole("OWNER", "ADMIN")
    .input(z.object({ name: z.string().min(1), deductible: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.expenseCategory.create({
        data: { ...input, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "expenseCategories");
      return created;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), deductible: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getForOrg(ctx.db.expenseCategory, id, ctx.orgId, { entityName: "Expense category" });
      const updated = await ctx.db.expenseCategory.update({ where: { id, organizationId: ctx.orgId }, data });
      invalidateOrg(ctx.orgId, "expenseCategories");
      return updated;
    }),
```

- [ ] **Step 2: Add a deductible toggle column to the manager**

In `src/components/settings/ExpenseCategoryManager.tsx`:

(a) Update the `Category` type:

```tsx
type Category = { id: string; name: string; deductible: boolean };
```

(b) Add a "Deductible" header cell. Replace the `<thead>` block with:

```tsx
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Category Name</th>
              <th className="px-3 py-2 text-left font-medium">Deductible</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
```

(c) In the **non-editing** row (the `<tr key={c.id} className="hover:bg-muted/30">` branch), add a deductible cell between the name cell and the actions cell:

```tsx
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate({ id: c.id, deductible: !c.deductible })}
                      disabled={updateMutation.isPending}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.deductible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.deductible ? "Deductible" : "Non-deductible"}
                    </button>
                  </td>
```

(d) In the **editing** row, add an empty placeholder cell so column counts stay aligned — insert between the name-input cell and the Save/Cancel cell:

```tsx
                  <td className="px-3 py-2" />
```

(e) Update the empty-state row's `colSpan` from `2` to `3`:

```tsx
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No categories yet.
                </td>
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint src/server/routers/expenseCategories.ts src/components/settings/ExpenseCategoryManager.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/expenseCategories.ts src/components/settings/ExpenseCategoryManager.tsx
git commit -m "feat(expenses): manage category deductibility in settings"
```

---

## Task 7: Income-by-category service (TDD)

**Files:**
- Create: `src/server/services/income-by-category.ts`
- Test: `src/test/income-by-category.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/income-by-category.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { attributeIncomeByCategory } from "@/server/services/income-by-category";

describe("attributeIncomeByCategory", () => {
  it("returns empty when there are no payments", () => {
    const r = attributeIncomeByCategory([]);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("attributes income ex-tax: uses line subtotal, not tax-inclusive total", () => {
    // Invoice total 110 (100 subtotal + 10 tax). A full payment of 110 must
    // attribute only the 100 of pre-tax income, NOT 110.
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 110,
        invoiceTotal: 110,
        lines: [{ name: "Design", subtotal: 100 }],
      },
    ]);
    expect(r.total).toBeCloseTo(100, 5);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ category: "Design", amount: 100, invoiceCount: 1 });
    expect(r.rows[0].pct).toBeCloseTo(100, 5);
  });

  it("prorates a partial payment across lines by subtotal share", () => {
    // Invoice total 200, two lines of 100 subtotal each. A 50% payment (100)
    // attributes 50 to each line.
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 100,
        invoiceTotal: 200,
        lines: [
          { name: "Design", subtotal: 100 },
          { name: "Hosting", subtotal: 100 },
        ],
      },
    ]);
    expect(r.total).toBeCloseTo(100, 5);
    const design = r.rows.find((x) => x.category === "Design")!;
    const hosting = r.rows.find((x) => x.category === "Hosting")!;
    expect(design.amount).toBeCloseTo(50, 5);
    expect(hosting.amount).toBeCloseTo(50, 5);
  });

  it("merges lines with the same name across invoices and counts distinct invoices", () => {
    const r = attributeIncomeByCategory([
      { invoiceId: "i1", amount: 100, invoiceTotal: 100, lines: [{ name: "Design", subtotal: 100 }] },
      { invoiceId: "i2", amount: 100, invoiceTotal: 100, lines: [{ name: "Design", subtotal: 100 }] },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBeCloseTo(200, 5);
    expect(r.rows[0].invoiceCount).toBe(2);
  });

  it("buckets blank line names as Uncategorized and skips zero-total invoices", () => {
    const r = attributeIncomeByCategory([
      { invoiceId: "z", amount: 0, invoiceTotal: 0, lines: [{ name: "X", subtotal: 0 }] },
      { invoiceId: "i1", amount: 50, invoiceTotal: 50, lines: [{ name: "  ", subtotal: 50 }] },
    ]);
    expect(r.total).toBeCloseTo(50, 5);
    expect(r.rows[0].category).toBe("Uncategorized");
  });

  it("sorts rows by amount descending", () => {
    const r = attributeIncomeByCategory([
      {
        invoiceId: "i1",
        amount: 300,
        invoiceTotal: 300,
        lines: [
          { name: "Small", subtotal: 100 },
          { name: "Big", subtotal: 200 },
        ],
      },
    ]);
    expect(r.rows.map((x) => x.category)).toEqual(["Big", "Small"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/income-by-category.test.ts`
Expected: FAIL — cannot resolve `@/server/services/income-by-category`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/income-by-category.ts`:

```ts
export type PaymentWithLines = {
  invoiceId: string;
  amount: number;
  invoiceTotal: number;
  lines: { name: string; subtotal: number }[];
};

export type IncomeRow = {
  category: string;
  amount: number;
  pct: number; // percent of total income 0..100
  invoiceCount: number;
};

export type IncomeByCategoryResult = {
  rows: IncomeRow[];
  total: number;
};

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "Uncategorized";
}

/**
 * Cash-basis income grouped by invoice-line name. Each payment is prorated
 * across its invoice's lines by the line's pre-tax `subtotal` (NOT `total`) so
 * the figure excludes sales tax, which is reported separately as tax liability.
 */
export function attributeIncomeByCategory(
  payments: PaymentWithLines[],
): IncomeByCategoryResult {
  const amounts = new Map<string, number>();
  const invoices = new Map<string, Set<string>>();

  for (const p of payments) {
    if (p.invoiceTotal <= 0) continue;
    const ratio = p.amount / p.invoiceTotal;
    for (const line of p.lines) {
      const key = normalizeName(line.name);
      const attributed = ratio * line.subtotal;
      if (attributed === 0) continue;
      amounts.set(key, (amounts.get(key) ?? 0) + attributed);
      if (!invoices.has(key)) invoices.set(key, new Set());
      invoices.get(key)!.add(p.invoiceId);
    }
  }

  const total = Array.from(amounts.values()).reduce((s, v) => s + v, 0);

  const rows: IncomeRow[] = Array.from(amounts.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
      invoiceCount: invoices.get(category)?.size ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/income-by-category.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Add the db-fetching wrapper**

Append to `src/server/services/income-by-category.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma";

type DateRange = { from?: Date; to?: Date };

export async function getIncomeByCategory(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<IncomeByCategoryResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const payments = await db.payment.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { paidAt: dateFilter } : {}),
    },
    select: {
      amount: true,
      invoiceId: true,
      invoice: {
        select: {
          total: true,
          lines: { select: { name: true, subtotal: true } },
        },
      },
    },
  });

  return attributeIncomeByCategory(
    payments.map((p) => ({
      invoiceId: p.invoiceId,
      amount: Number(p.amount),
      invoiceTotal: Number(p.invoice.total),
      lines: p.invoice.lines.map((l) => ({
        name: l.name,
        subtotal: Number(l.subtotal),
      })),
    })),
  );
}
```

> If eslint flags the `import type` position, move it to the top of the file.

- [ ] **Step 6: Verify compile + tests still pass**

Run: `npx tsc --noEmit && npx vitest run src/test/income-by-category.test.ts`
Expected: no errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/income-by-category.ts src/test/income-by-category.test.ts
git commit -m "feat(reports): cash-basis income-by-category (ex-tax proration)"
```

---

## Task 8: Deductible-expenses service (TDD)

**Files:**
- Create: `src/server/services/deductible-expenses.ts`
- Test: `src/test/deductible-expenses.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/deductible-expenses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateDeductibleExpenses } from "@/server/services/deductible-expenses";

const UNCATEGORIZED = "Uncategorized — review";

describe("aggregateDeductibleExpenses", () => {
  it("returns zeros for an empty list", () => {
    const r = aggregateDeductibleExpenses([]);
    expect(r.deductibleTotal).toBe(0);
    expect(r.nonDeductibleTotal).toBe(0);
    expect(r.uncategorizedTotal).toBe(0);
    expect(r.byCategory).toEqual([]);
  });

  it("excludes uncategorized expenses from the deductible total", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 100, categoryId: null, categoryName: null, deductible: null },
    ]);
    expect(r.deductibleTotal).toBe(0);
    expect(r.uncategorizedTotal).toBe(100);
    expect(r.byCategory).toEqual([
      { category: UNCATEGORIZED, amount: 100, deductible: false },
    ]);
  });

  it("splits deductible from non-deductible categories", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 200, categoryId: "c1", categoryName: "Software", deductible: true },
      { amount: 50, categoryId: "c1", categoryName: "Software", deductible: true },
      { amount: 80, categoryId: "c2", categoryName: "Owner draws", deductible: false },
    ]);
    expect(r.deductibleTotal).toBe(250);
    expect(r.nonDeductibleTotal).toBe(80);
    expect(r.uncategorizedTotal).toBe(0);
    const software = r.byCategory.find((x) => x.category === "Software")!;
    expect(software).toMatchObject({ amount: 250, deductible: true });
  });

  it("sorts categories by amount descending", () => {
    const r = aggregateDeductibleExpenses([
      { amount: 10, categoryId: "c1", categoryName: "Small", deductible: true },
      { amount: 90, categoryId: "c2", categoryName: "Big", deductible: true },
    ]);
    expect(r.byCategory.map((x) => x.category)).toEqual(["Big", "Small"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/deductible-expenses.test.ts`
Expected: FAIL — cannot resolve `@/server/services/deductible-expenses`.

- [ ] **Step 3: Write the implementation**

Create `src/server/services/deductible-expenses.ts`:

```ts
export const UNCATEGORIZED_LABEL = "Uncategorized — review";

export type ExpenseForDeduction = {
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  deductible: boolean | null; // null when uncategorized
};

export type DeductibleCategoryRow = {
  category: string;
  amount: number;
  deductible: boolean;
};

export type DeductibleResult = {
  deductibleTotal: number;
  nonDeductibleTotal: number;
  uncategorizedTotal: number;
  byCategory: DeductibleCategoryRow[];
};

/**
 * Aggregate expenses for the tax dashboard. Uncategorized expenses (no
 * category) cannot be assumed deductible, so they go to their own bucket and
 * are EXCLUDED from `deductibleTotal` — surfacing the data-hygiene gap.
 */
export function aggregateDeductibleExpenses(
  expenses: ExpenseForDeduction[],
): DeductibleResult {
  const byKey = new Map<string, DeductibleCategoryRow>();
  let deductibleTotal = 0;
  let nonDeductibleTotal = 0;
  let uncategorizedTotal = 0;

  for (const e of expenses) {
    const isUncategorized = e.categoryId === null;
    const category = isUncategorized ? UNCATEGORIZED_LABEL : e.categoryName ?? UNCATEGORIZED_LABEL;
    const deductible = isUncategorized ? false : e.deductible === true;

    if (isUncategorized) uncategorizedTotal += e.amount;
    else if (deductible) deductibleTotal += e.amount;
    else nonDeductibleTotal += e.amount;

    const existing = byKey.get(category);
    if (existing) existing.amount += e.amount;
    else byKey.set(category, { category, amount: e.amount, deductible });
  }

  const byCategory = Array.from(byKey.values()).sort((a, b) => b.amount - a.amount);
  return { deductibleTotal, nonDeductibleTotal, uncategorizedTotal, byCategory };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/deductible-expenses.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Add the db-fetching wrapper**

Append to `src/server/services/deductible-expenses.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma";

type DateRange = { from?: Date; to?: Date };

export async function getDeductibleExpenses(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<DeductibleResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const expenses = await db.expense.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      rate: true,
      qty: true,
      categoryId: true,
      category: { select: { name: true, deductible: true } },
    },
  });

  return aggregateDeductibleExpenses(
    expenses.map((e) => ({
      amount: Number(e.rate) * e.qty,
      categoryId: e.categoryId,
      categoryName: e.category?.name ?? null,
      deductible: e.category?.deductible ?? null,
    })),
  );
}
```

> Uses `createdAt` as the expense date, matching `reports.profitLoss`. If eslint flags the `import type` position, move it to the top.

- [ ] **Step 6: Verify compile + tests still pass**

Run: `npx tsc --noEmit && npx vitest run src/test/deductible-expenses.test.ts`
Expected: no errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/deductible-expenses.ts src/test/deductible-expenses.test.ts
git commit -m "feat(reports): deductible-expense aggregation"
```

---

## Task 9: Extract Tax Liability into a shared service (refactor)

This is a pure refactor — behavior must not change. The existing `routers-reports-procedures.test.ts` covers `taxLiability` and is the regression guard.

**Files:**
- Create: `src/server/services/tax-liability.ts`
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Create the service with the extracted logic**

Create `src/server/services/tax-liability.ts`. Move the **entire body** of the `taxLiability` procedure (currently `reports.ts:607-777`, the `async ({ ctx, input }) => { ... }` body) into this function, replacing `ctx.db` with `db`, `ctx.orgId` with `orgId`, and `input` with `params`:

```ts
import type { PrismaClient } from "@/generated/prisma";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";

export type TaxLiabilityParams = {
  from?: Date;
  to?: Date;
  basis: "cash" | "accrual";
};

export type TaxSummaryRow = {
  taxName: string;
  taxRate: number;
  totalCollected: number;
  invoiceCount: number;
};

export type TaxDetailRow = {
  invoiceNumber: string;
  clientName: string;
  invoiceDate: Date;
  invoiceTotal: number;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  paymentStatus: string;
  paymentDate: Date | null;
};

export type TaxLiabilityResult = {
  summary: TaxSummaryRow[];
  details: TaxDetailRow[];
  grandTotal: number;
};

export async function getTaxLiability(
  db: PrismaClient,
  orgId: string,
  params: TaxLiabilityParams,
): Promise<TaxLiabilityResult> {
  const input = params; // keep the original variable name used in the moved body

  if (input.basis === "accrual") {
    // ... PASTE the accrual branch from reports.ts here, with ctx.db -> db, ctx.orgId -> orgId ...
  }

  // ... PASTE the cash branch from reports.ts here, with ctx.db -> db, ctx.orgId -> orgId ...
}
```

> Mechanical move: copy lines 609–776 of `reports.ts` verbatim into the function body, then within the pasted text replace `ctx.db` → `db` and `ctx.orgId` → `orgId`. `input` is already aliased. Do not change any logic, field names, or rounding.

- [ ] **Step 2: Replace the procedure body with a service call**

In `src/server/routers/reports.ts`, add the import near the other service imports:

```ts
import { getTaxLiability } from "@/server/services/tax-liability";
```

Then replace the entire `taxLiability` procedure body so it reads:

```ts
  taxLiability: protectedProcedure
    .input(
      dateRangeSchema.extend({
        basis: z.enum(["cash", "accrual"]).default("accrual"),
      })
    )
    .query(async ({ ctx, input }) => {
      return getTaxLiability(ctx.db, ctx.orgId, input);
    }),
```

Remove any now-unused imports in `reports.ts` **only if** they are no longer referenced anywhere else in the file (check `InvoiceType` — it is also used by `taxDashboard` added later and possibly other procedures; leave it if still referenced). Run tsc to confirm.

- [ ] **Step 3: Verify no regression**

Run: `npx tsc --noEmit && npx vitest run src/test/routers-reports-procedures.test.ts`
Expected: no type errors; all existing tax-liability tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/tax-liability.ts src/server/routers/reports.ts
git commit -m "refactor(reports): extract taxLiability into shared service"
```

---

## Task 10: `taxDashboard` aggregation procedure

**Files:**
- Modify: `src/server/routers/reports.ts`

- [ ] **Step 1: Add imports**

In `src/server/routers/reports.ts`, add (with the other service imports):

```ts
import { getIncomeByCategory } from "@/server/services/income-by-category";
import { getDeductibleExpenses } from "@/server/services/deductible-expenses";
import { get1099Pack } from "@/server/services/contractor-1099";
```

- [ ] **Step 2: Add the procedure**

Add this procedure inside `reportsRouter`, immediately after the `taxLiability` procedure:

```ts
  taxDashboard: protectedProcedure
    .input(
      dateRangeSchema.extend({
        basis: z.enum(["cash", "accrual"]).default("cash"),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1099 figures are annual; derive the tax year from the range end (or
      // start), defaulting to the current calendar year.
      const year = (input.to ?? input.from ?? new Date()).getUTCFullYear();

      const [tax, income, deductible, pack] = await Promise.all([
        getTaxLiability(ctx.db, ctx.orgId, { from: input.from, to: input.to, basis: input.basis }),
        getIncomeByCategory(ctx.db, ctx.orgId, { from: input.from, to: input.to }),
        getDeductibleExpenses(ctx.db, ctx.orgId, { from: input.from, to: input.to }),
        get1099Pack(ctx.db, ctx.orgId, year),
      ]);

      const eligibleRows = pack.rows.filter((r) => r.eligible);
      const contractorExposure = {
        year,
        threshold: pack.threshold,
        eligibleCount: eligibleRows.length,
        totalReportable: eligibleRows.reduce((s, r) => s + r.total, 0),
        missingW9Count: pack.rows.filter((r) => r.missingW9).length,
      };

      return {
        salesTaxDue: tax.grandTotal,
        salesTaxByType: tax.summary,
        grossIncome: income.total,
        incomeByCategory: income.rows,
        deductible,
        estimatedNetIncome: income.total - deductible.deductibleTotal,
        contractorExposure,
      };
    }),
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/reports.ts
git commit -m "feat(reports): taxDashboard aggregation procedure"
```

---

## Task 11: Tax-Ready Dashboard page + nav card

**Files:**
- Create: `src/app/(dashboard)/reports/tax-dashboard/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(dashboard)/reports/tax-dashboard/page.tsx`:

```tsx
import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { TaxBasisToggle } from "@/components/reports/TaxBasisToggle";

const UNCATEGORIZED_LABEL = "Uncategorized — review";

export default async function TaxDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  const basis = params.basis === "accrual" ? ("accrual" as const) : ("cash" as const);

  const [data, org] = await Promise.all([
    api.reports.taxDashboard({ from, to, basis }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const uncategorized = data.deductible.byCategory.find((c) => c.category === UNCATEGORIZED_LABEL);

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Tax-Ready Dashboard"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`${dateRange} (${basis === "cash" ? "Cash Basis" : "Accrual Basis"})`}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/reports" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden">
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Tax-Ready Dashboard</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/tax-dashboard" from={params.from} to={params.to}>
        <TaxBasisToggle basis={basis} />
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Sales Tax Due</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.salesTaxDue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Gross Income</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.grossIncome.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Deductible Expenses</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.deductible.deductibleTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Est. Net Income</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.estimatedNetIncome.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">1099 Exposure ({data.contractorExposure.year})</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.contractorExposure.totalReportable.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{data.contractorExposure.eligibleCount} contractors</p>
        </div>
      </div>

      {/* Income by category */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Income</p>
          <p className="text-base font-semibold mt-0.5">By Service (ex-tax, cash collected)</p>
        </div>
        {data.incomeByCategory.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No income recorded for the selected period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoices</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Share</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Income</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.incomeByCategory.map((r) => (
                <tr key={r.category} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{r.category}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">{r.invoiceCount}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">{r.pct.toFixed(1)}%</td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">${r.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deductible expenses */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Expenses</p>
            <p className="text-base font-semibold mt-0.5">Deductible by Category</p>
          </div>
          <Link href="/reports/expenses" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden">
            Full breakdown <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {uncategorized && (
          <div className="px-6 py-3 bg-amber-50 text-amber-800 text-sm border-b border-amber-200">
            ${uncategorized.amount.toFixed(2)} of expenses are uncategorized and excluded from the deductible total — assign categories to include them.
          </div>
        )}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border/40">
            {data.deductible.byCategory.map((c) => (
              <tr key={c.category} className="hover:bg-accent/20 transition-colors">
                <td className="px-6 py-3.5 font-medium">{c.category}</td>
                <td className="px-6 py-3.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.deductible ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {c.deductible ? "Deductible" : "Non-deductible"}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right font-semibold tabular-nums">${c.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-right">Total Deductible</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">${data.deductible.deductibleTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sales tax + 1099 deep links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/reports/tax-liability" className="rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-center justify-between print:hidden">
          <div>
            <p className="font-semibold text-sm">Sales Tax Detail</p>
            <p className="text-xs text-muted-foreground mt-0.5">${data.salesTaxDue.toFixed(2)} due — view by invoice</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link href="/reports/1099" className="rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-center justify-between print:hidden">
          <div>
            <p className="font-semibold text-sm">1099 / Contractor Tax Pack</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.contractorExposure.eligibleCount} eligible
              {data.contractorExposure.missingW9Count > 0 ? ` · ${data.contractorExposure.missingW9Count} missing W-9` : ""}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav card**

In `src/app/(dashboard)/reports/page.tsx`, add `Landmark` to the `lucide-react` import on line 3. Then add this object as the **first** entry of the `reports` array (so it leads the list):

```tsx
  {
    href: "/reports/tax-dashboard",
    label: "Tax-Ready Dashboard",
    description: "Sales tax due, income by service, deductible expenses, and 1099 exposure in one view.",
    icon: <Landmark className="w-4 h-4" />,
    color: "bg-orange-50 text-orange-600",
  },
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/reports/tax-dashboard/page.tsx" "src/app/(dashboard)/reports/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/reports/tax-dashboard/page.tsx" "src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(reports): tax-ready dashboard page + nav card"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full type-check, lint, and test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: no type errors, no lint errors, all tests pass (including the three new service test files and the unchanged `routers-reports-procedures.test.ts`).

- [ ] **Step 2: Manual smoke (optional, requires dev DB)**

Run: `npm run dev`, then visit:
- `/reports` — two new cards (Tax-Ready Dashboard leads, Client Concentration after Client Health).
- `/reports/client-concentration` — risk banner, summary cards, share table; try the "This Quarter" and "This Year" presets.
- `/reports/tax-dashboard` — five summary cards, income-by-service table, deductible table (mark a category non-deductible in `/settings/expenses` and confirm it leaves the deductible total), uncategorized callout when applicable, cash/accrual toggle.

- [ ] **Step 3: Confirm clean tree**

Run: `git status`
Expected: working tree clean; all work committed.

---

## Self-Review Notes (author)

- **Spec coverage:** sales tax due (Task 9/10), income by category ex-tax (Task 7), deductible expenses incl. uncategorized handling (Tasks 5/6/8), 1099 exposure reuse (Task 10), month/quarter/year presets (Task 1 + existing presets), client concentration top-%/HHI/risk (Tasks 2/3/4), nav cards + settings toggle, shared tax-liability service (Task 9). CSV/PDF + fiscal-year correctly omitted (out of scope).
- **Ex-tax correctness** pinned by an explicit test in Task 7 Step 1.
- **Type consistency:** `ConcentrationResult`/`IncomeByCategoryResult`/`DeductibleResult` defined in Tasks 2/7/8 and consumed unchanged in pages (Tasks 4/11) and procedures (Tasks 3/10). `UNCATEGORIZED_LABEL` string matches between service (Task 8) and dashboard page (Task 11).
