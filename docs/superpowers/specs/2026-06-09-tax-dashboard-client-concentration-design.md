# Tax-Ready Dashboard + Client Concentration Report — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Backlog item:** #8 Reporting / analytics — tax-ready dashboard + client concentration report

## Goal

Ship two new reports under `/reports`:

1. **Tax-Ready Dashboard** — one consolidated screen showing **sales tax due**,
   **income by category**, **deductible expenses**, and **1099 exposure**, with
   month / quarter / year period presets.
2. **Client Concentration Report** — revenue share per client, top-client %,
   over-dependence risk indicators (e.g. "Top client is 47% of revenue").

The two reports share a new period-preset control. Both reuse existing services
and UI patterns rather than recomputing numbers, so they stay consistent with
the standalone reports (Tax Liability, 1099, Expense Breakdown) already in the app.

## Context — what already exists

- `reports.taxLiability` (inline in `src/server/routers/reports.ts`) — sales/collected
  tax by type, cash/accrual basis. This **is** "sales tax due."
- `reports.profitLoss`, `reports.profitabilityByClient`, `reports.revenueByMonth`,
  `reports.expenseBreakdown`.
- `services/contractor-1099.ts` — 1099-NEC exposure for contractors paid $600+.
- `services/year-end-reports.ts` — bundled P&L / expenses / payments / tax.
- Report page pattern: server component → `api.reports.X({from,to,...})` →
  `ReportHeader` + `ReportFilters` (custom `?from=&to=` only) + `PrintReportButton`.
- `reports/page.tsx` lists report nav cards.

### Constraints discovered in the schema

- **No `deductible` concept** anywhere — `Expense` / `ExpenseCategory` only carry
  category + `reimbursable`. Requires a schema change.
- **`InvoiceLine` has free-text `name` but no `itemId`** link to the `Item` catalog.
  "Income by service" therefore groups by `InvoiceLine.name`, not a catalog item.
- **`Payment` is invoice-level** (no per-line link). Cash-basis income-by-category
  must prorate each payment across that invoice's lines — the same proration the
  cash-basis branch of `taxLiability` already does.
- **`Expense.categoryId` is nullable** — uncategorized expenses have no deductible flag.
- **No org fiscal-year setting** — period presets are calendar-based.

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Deductibility model | `deductible` boolean on **ExpenseCategory**, default `true`; owner marks non-deductible categories once in settings. |
| "Income by category" dimension | Group by **`InvoiceLine.name`** (the service/line sold). |
| Concentration revenue basis | **Cash** (payments received). |
| CSV/PDF export | **Out of scope for v1** — browser print via existing `PrintReportButton`. Fast-follow. |
| Tax dashboard composition | Aggregate + **deep-link** to existing detail reports; do not duplicate their full tables. |

## Architecture

### 1. Schema change (tax dashboard only)

```prisma
model ExpenseCategory {
  // ...
  deductible Boolean @default(true)
}
```

Plus a Prisma migration. Existing categories default to deductible (the common case).

**Uncategorized expenses** (`categoryId == null`) are bucketed as
**"Uncategorized — review"**, shown as a separate line, and **excluded from the
deductible total** — never silently counted as deductible.

### 2. Shared period control — `ReportPeriodFilter`

New client component (layered alongside `ReportFilters`):

- Presets: **This Month · This Quarter · This Year · Last Year · Custom**, calendar-based.
- Resolves a preset to concrete `from`/`to` and writes them to the URL using the
  **same `?from=&to=` searchParams contract** every existing report consumes — so it
  composes with the current server-component pattern with no new data plumbing.
- Defaults: tax dashboard → This Year (YTD); concentration → This Year.
- Custom mode falls back to the existing from/to date inputs.

(Fiscal-year periods are explicitly future work — no org setting exists today.)

### 3. Server

**Extract shared logic:**
- Move the body of `reports.taxLiability` into `src/server/services/tax-liability.ts`
  as pure functions `getTaxLiability(db, orgId, { from, to, basis })`. The existing
  `reports.taxLiability` procedure becomes a thin wrapper. Dashboard + standalone
  report now share one implementation (no drift).

**New services (pure, unit-testable):**

- `src/server/services/income-by-category.ts`
  - Cash basis. For each payment in range, `ratio = payment.amount / invoice.total`;
    for each invoice line, attribute `ratio * line.subtotal` (**ex-tax — use `subtotal`,
    not `total`**) to the bucket keyed by normalized `line.name`.
  - Returns `{ rows: { category, amount, pct, invoiceCount }[], total }`, sorted desc.
  - **Rationale for ex-tax:** sales tax is reported separately as "sales tax due."
    Summing line `total` would fold that tax back into income and double-count it.

- `src/server/services/client-concentration.ts`
  - Cash share per client = payments collected from client ÷ total collected in range.
  - Returns per-client `{ clientId, name, revenue, share, cumulativeShare }[]` sorted desc,
    plus summary `{ totalRevenue, activeClients, topClientPct, top3Pct, top5Pct, hhi, riskLevel }`.
  - `hhi = Σ(share²) * 10000` (0–10000 Herfindahl–Hirschman Index).
  - `riskLevel` from top-client share: `critical ≥ 50%`, `high ≥ 30%`, `watch ≥ 15%`,
    else `ok`; HHI banding informs a secondary signal.
  - Zero total revenue → empty state (no divide-by-zero).

**New procedures in `reports.ts`:**

- `reports.taxDashboard({ from, to, basis = "cash" })` aggregates:
  - `salesTaxDue` — from `tax-liability` service (cash basis, to match income).
  - `incomeByCategory` — income-by-category service.
  - `deductibleExpenses` — expenses in range grouped by category, joined to the
    `deductible` flag; returns `{ deductibleTotal, nonDeductibleTotal, uncategorizedTotal, byCategory[] }`.
  - `estimatedNetIncome` = gross income − deductible expenses.
  - `contractorExposure` — reuse `services/contractor-1099.ts` (summary only).
- `reports.clientConcentration({ from, to })` wraps the concentration service.

**Router extension:**
- `expenseCategories` router: include `deductible` in `list` select; add it to the
  update mutation input.

### 4. Pages

- `src/app/(dashboard)/reports/tax-dashboard/page.tsx`
  - `ReportHeader` + `ReportPeriodFilter` + `PrintReportButton`.
  - Summary cards: Sales Tax Due · Gross Income · Deductible Expenses · Est. Net · 1099 Exposure.
  - Sections: Income by Category table; Deductible Expenses by category (+ "Uncategorized —
    review" callout); Sales Tax by type (deep-link → `/reports/tax-liability`);
    1099 mini-summary (deep-link → `/reports/1099`).
- `src/app/(dashboard)/reports/client-concentration/page.tsx`
  - `ReportHeader` + `ReportPeriodFilter`.
  - Risk banner when over-dependent (e.g. "⚠ Top client is 47% of revenue").
  - Summary cards: Top client % · Top 3 % · HHI · Active clients.
  - Revenue-share table: client · revenue · % share · cumulative %, with inline share bars.
- `reports/page.tsx`: add two nav cards (Tax-Ready Dashboard, Client Concentration).
- Expense-category settings UI: add a deductible toggle per category.

### 5. Data flow

```
page.tsx (server component)
  → api.reports.taxDashboard({from,to,basis})  /  api.reports.clientConcentration({from,to})
    → procedure
      → services: tax-liability · income-by-category · expense aggregation · contractor-1099
        → Prisma (org-scoped via protectedProcedure / ctx.orgId)
ReportPeriodFilter (client) → updates ?from=&to= → server re-renders
```

### 6. Error handling

- All procedures `protectedProcedure`, org-scoped on `ctx.orgId`.
- Date parsing guards (NaN → undefined), mirroring existing report pages.
- Divide-by-zero guards: concentration and percentage math return empty state when
  total revenue is 0.
- Empty-state rows in every table.

### 7. Testing (vitest)

Unit tests for the three pure services:

- **income-by-category** — *pin the ex-tax assertion* (income excludes line tax);
  payment proration correctness; partial payment; multi-line invoice.
- **client-concentration** — shares sum to 100%; HHI computation; risk thresholds at
  boundaries (15/30/50%); single-client (100%, HHI 10000) and zero-revenue edges.
- **deductible aggregation** — uncategorized bucket excluded from deductible total;
  non-deductible category excluded; mixed set.

## Build order

1. **Client concentration** — independent, no migration. Clean first vertical slice.
   Lands with `ReportPeriodFilter`.
2. **Schema migration** + deductible toggle in expense-category settings + router update.
3. **Tax dashboard** — extract `tax-liability` service, build aggregation procedure + page.

## Out of scope (v1)

- CSV / PDF export api routes (print works; fast-follow).
- Fiscal-year period support.
- Per-expense deductible override (deductibility lives on the category).
