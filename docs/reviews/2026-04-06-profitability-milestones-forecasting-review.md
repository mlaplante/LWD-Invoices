# Code Review: Profitability, Milestones, Forecasting
Date: 2026-04-06
Commits: 5eed2b3..7f3d4ed (11 commits)
Reviewer: Senior Code Review

---

## Overall Assessment

The implementation is solid, well-structured, and faithfully aligned with the spec. All three features are implemented. The transaction handling, org scoping, and rounding patterns are correct throughout. The issues below are genuine defects or meaningful risks — nothing here is stylistic preference.

---

## What Was Done Well

- All three procedures correctly scope every query to `organizationId: ctx.orgId`. No leakage detected.
- `Math.round(x * 100) / 100` used consistently for all financial output values. This is the correct pattern for a `number`-based aggregation layer.
- `$transaction` is used correctly in `complete` for the auto-invoice path. Both milestone update and invoice creation are atomic.
- `computeNextRunAt` reuse (imported from the Inngest function) for recurring projections avoids drift between the actual scheduler and the forecast — an excellent design decision.
- `generateInvoiceNumber` called inside the transaction, which is correct — number generation must be serialized to prevent duplicates.
- Idempotency guards are present on both `complete` (already-completed check) and `reopen` (not-completed check).
- `MilestoneList` component handles loading, empty, completed, and invoice-linked states cleanly.
- Audit log entry is created for auto-generated invoices, consistent with the rest of the codebase.

---

## Critical Issues (Must Fix)

### 1. `reopen` final `update` missing `organizationId` in where clause
**File:** `src/server/routers/milestones.ts`, line 181-183

```ts
return ctx.db.milestone.update({
  where: { id: input.id },   // <-- missing organizationId
  data: { completedAt: null },
});
```

The `findUnique` above checks `organizationId: ctx.orgId`, but the subsequent `update` uses only `{ id: input.id }`. If a race condition or middleware issue caused the org check to pass against a stale read, the update itself would have no tenant guard. Consistent with how `update` is handled elsewhere in the router (see line 56: `where: { id }` — same pattern exists), but this is a broader pattern bug.

The same pattern exists at line 56 (`update`) and line 73 (`delete`). All three `update`/`delete` calls should use `where: { id: input.id, organizationId: ctx.orgId }`.

**Fix for `reopen`:**
```ts
return ctx.db.milestone.update({
  where: { id: input.id, organizationId: ctx.orgId },
  data: { completedAt: null },
});
```
Apply the same fix at lines 56 and 73. Note: `delete` at line 73 only includes `{ id: input.id }` in the final `delete` call — also needs `organizationId`.

### 2. `profitabilityByProject` revenue uses `line.total` (pre-payment-allocation) instead of payment amounts

**File:** `src/server/routers/reports.ts`, lines 438-443

The procedure attributes revenue by summing `InvoiceLine.total` for lines whose source is a billed time entry or expense. This means:
- Revenue is shown as the full invoiced amount, not what was actually paid.
- A SENT invoice counts the same as a PAID invoice, which contradicts how `profitabilityByClient` calculates revenue (payments only, filtered by `paidAt`).

`paidStatuses` on line 395 includes `"SENT"` and `"PARTIALLY_PAID"`, which means unbilled revenue is counted as earned.

The spec says for project revenue: "Sum of Payment amounts for invoices where InvoiceLine links to the project." The implementation instead sums line totals, not payment amounts. This is a **calculation correctness defect** that will overstate project revenue for partially-paid or unpaid-but-sent invoices.

The client and project tabs will show inconsistent numbers for the same underlying data.

**Fix approach:** Join payment amounts through the invoice, prorating across the invoice's lines. Or, simpler: restrict `paidStatuses` to `["PAID"]` only, which makes project revenue consistent with the client-level view (payments-based, cash accounting).

---

## Important Issues (Should Fix)

### 3. `revenueForecast` misses `OVERDUE` status invoices

**File:** `src/server/routers/reports.ts`, forecast Step 1 query

```ts
status: { in: ["SENT", "PARTIALLY_PAID"] },
```

The spec says "Query all SENT + PARTIALLY_PAID invoices" and separately handles overdue by checking `dueDate < now`. However, the system has an explicit `OVERDUE` status (used in `invoiceAging` at line 527). Invoices that have been transitioned to `OVERDUE` status are excluded from the forecast entirely, which means past-due invoices with explicit OVERDUE status would be invisible in the forecast and not included in `overdueAmount`.

**Fix:**
```ts
status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
```

### 4. Milestone `complete` transaction casts `tx as never` for `generateInvoiceNumber`

**File:** `src/server/routers/milestones.ts`, line 104

```ts
const number = await generateInvoiceNumber(tx as never, ctx.orgId);
```

This `as never` cast suppresses TypeScript's type-checking for the transaction client type. The `duplicate` procedure in `invoices.ts` uses `tx as unknown as PrismaClient` which is the established project pattern and is marginally safer. Change to match the existing pattern:

```ts
import type { PrismaClient } from "@/generated/prisma";
// ...
const number = await generateInvoiceNumber(tx as unknown as PrismaClient, ctx.orgId);
```

### 5. `profitabilityByClient` expense date filter uses `createdAt` instead of a billing date

**File:** `src/server/routers/reports.ts`, line ~300

```ts
...(dateFilter ? { createdAt: dateFilter } : {}),
```

Time entries use `date` (line 316), which is the actual work date. Expenses use `createdAt`, which is the record-creation timestamp, not when the expense was incurred. Depending on how expenses are entered (batch entry after the fact), this can cause expenses to fall outside a date-filtered range even when they belong there. The spec is ambiguous here, but `createdAt` is the wrong field if the goal is period-based reporting.

---

## Suggestions (Nice to Have)

### 6. `profitabilityByClient` and `profitabilityByProject` each make 3-4 separate DB round trips

Both procedures sequentially query payments, then expenses+time, then clients/projects. All of these could be issued with `Promise.all`. The payments query is already outside `Promise.all`. In `profitabilityByClient`, the client name lookup at line 326 happens after all the aggregation work — this extra sequential query could be eliminated by including `client: { select: { id, name } }` in the payments query itself, since every payment already fetches its invoice's `clientId`.

### 7. `revenueForecast` does not guard against infinite loop if `computeNextRunAt` returns the same date

If `computeNextRunAt` returned the same `runAt` for a given frequency (e.g., a bug or unexpected frequency enum value), the while loop at the forecast step would run indefinitely. A safety counter (`if (iterations > 1000) break`) is standard defensive practice for time-projection loops.

### 8. `MilestoneList` currency display assumes USD formatting

**File:** `src/components/projects/MilestoneList.tsx`

```tsx
${Number(m.amount).toFixed(2)}
```

The hardcoded `$` prefix does not use the project or org currency. This is a cosmetic issue for non-USD users, but inconsistent with how amounts are displayed elsewhere in the app (using the `Currency` formatter utility).

### 9. Auto-invoice created invoice uses org's default currency, not project's currency

**File:** `src/server/routers/milestones.ts`, lines 106-108

The invoice is created with `defaultCurrency` from the org, but the milestone's project may have a different `currencyId`. This will silently create invoices in the wrong currency for projects with non-default currencies.

**Fix:** Include `project.currencyId` in the milestone fetch (already fetches `project.client`), then use `milestone.project.currencyId` instead of `defaultCurrency.id`.

---

## Plan Alignment

| Feature | Plan Alignment | Notes |
|---|---|---|
| `profitabilityByClient` | Aligned | Revenue via payments, costs via expense+time. Date filter applied. |
| `profitabilityByProject` | Partial deviation | Revenue uses line totals, not payment amounts — contradicts spec language and client view. |
| `revenueForecast` | Aligned with gap | OVERDUE status invoices excluded from Step 1. |
| Milestone schema migration | Fully aligned | All four fields added as spec'd. |
| `complete` mutation | Aligned | Transaction, invoice generation, audit log all present. |
| `reopen` mutation | Aligned | Clears `completedAt`, does not delete invoice. |
| `MilestoneForm` | Aligned | `amount` + `autoInvoice` conditional on amount present. |
| `MilestoneList` | Aligned | Complete/reopen/add actions, invoice link shown. |
| Profitability page | Aligned | Client/project tabs, summary cards, table present. |
| Forecast page | Aligned | Stacked bar chart, horizon selector, summary cards, table. |
| Reports nav card | Aligned | Both nav cards added. |

---

## Summary by Priority

**Must Fix (2):**
1. `reopen`/`update`/`delete` missing `organizationId` in final write operation — security/correctness
2. `profitabilityByProject` revenue calculation uses line totals not payment amounts — financial correctness

**Should Fix (3):**
3. Forecast excludes `OVERDUE`-status invoices from pipeline
4. `tx as never` type cast — change to `tx as unknown as PrismaClient`
5. Expense cost date filter uses `createdAt` not an explicit expense date field

**Nice to Have (4):**
6. Sequential DB round trips in profitability procedures — use `Promise.all`
7. Missing loop safety counter in `revenueForecast` recurring projection
8. Hardcoded `$` in `MilestoneList` amount display
9. Auto-invoice uses org default currency instead of project currency
