# Project & Retainer Features: Change Orders, Retainer Burn-down, Project Health, Utilization

**Date**: 2026-06-09
**Status**: Draft (pending review)

---

Four features under the "Project & retainer" umbrella. Three are read-only analytics over
existing data (retainer burn-down, project health, utilization); one adds a light write path
that reuses the existing estimate → portal-approval → invoice-line machinery (change orders).

**Confirmed design decisions:**
1. Change orders **reuse the estimate machinery** (a change order is a project-scoped estimate).
2. Utilization "billable" is **derived**: billable = time on a non-flat-rate project (rate > 0)
   **or** an hours-retainer; non-billable = everything else.
3. Retainer burn-down covers **both** retainer types (`HoursRetainer` hours + `Retainer` money).

---

## Feature 1: Change Orders

### Problem
A project's scope grows mid-engagement. Today there's no first-class way to capture a scope
change, get client sign-off, and roll it into billing. Estimates exist but aren't tied to a
project or distinguished as change orders.

### Approach: a change order IS a project-scoped estimate
The app already has everything a change order needs on the `Invoice`/Estimate model:
line items, a `portalToken`, the portal e-signature flow (`portal.signProposal` → status
`ACCEPTED` + `signedAt`), and `invoices.convertEstimateToInvoice` (estimate → invoice with
copied lines). A change order is an `Invoice` of `type = ESTIMATE` that is (a) linked to a
project and (b) flagged as a change order.

### Schema Changes
Add to `Invoice`:
```
projectId      String?
project        Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
isChangeOrder  Boolean   @default(false)

@@index([organizationId, projectId])
```
Add to `Project`:
```
invoices  Invoice[]
```
No new model. `projectId` is nullable and back-compatible (existing invoices/estimates have
none). Migration is additive (nullable column + boolean default + index) — safe on existing rows.

### Create / Edit Flow
- **`invoices.createChangeOrder`** (`requireRole OWNER/ADMIN`) — thin wrapper over the existing
  estimate-create path: forces `type = ESTIMATE`, `isChangeOrder = true`, sets `projectId`, and
  copies the project's `clientId` + `currencyId`. Body is the standard estimate line editor
  (description, qty, unit price, optional tax) so scope add-ons are line items from the start.
- Editing/sending/duplicating reuse the existing estimate procedures unchanged (they operate on
  any `type = ESTIMATE` invoice).

### Approval & Conversion (all existing, no new code)
1. Send the change order; client opens the portal link and signs via `portal.signProposal`
   → status `ACCEPTED`, `signedAt` set, `SignatureAuditLog` row written.
2. `invoices.convertEstimateToInvoice` turns the accepted change order into a real invoice with
   the change-order lines copied. This already exists and already guards on
   `status === ACCEPTED`.

### Budget impact (read-time, no mutation)
Approved change-order totals are **summed at read time** by the project-health reader — we do
**not** mutate `Project.projectedHours`. Budget is evaluated in **money terms** to unify the base
plan with change orders: effective budget = base budget + Σ(approved change-order totals), where
base budget = `projectedHours × rate` for hourly projects, or the flat amount for flat-rate
projects. This keeps `Project` the single source of the *original* plan and avoids a write-side
trigger on approval.

### UI
- **Project detail** (`projects/[id]/page.tsx`): a "Change Orders" section listing this
  project's change orders (`invoices.list` filtered by `projectId` + `isChangeOrder`), each with
  status badge (Draft / Sent / Accepted / Converted), amount, and a link to the estimate detail.
  "New change order" button → create form.
- **Create form**: reuse the estimate line-item editor component; pre-fills client + currency
  from the project.
- Portal side needs **no change** — change orders render through the existing estimate/proposal
  portal view and sign flow.

---

## Feature 2: Retainer Burn-down Dashboard

### Problem
Retainers exist (`HoursRetainer` with monthly periods; `Retainer` prepaid money balance) but
there's no view of how fast they're being consumed, when they'll run out, or a warning before
they're nearly exhausted.

### Approach: one pure burn-down service over both retainer types
New pure module `src/server/services/retainer-burndown.ts` (mirrors the
`client-health-score.ts` split: pure compute + a data builder), exposed via the existing
`retainers`/`hoursRetainers` routers.

**Hours retainer (per active period):**
- `includedHours` = `period.includedHoursSnapshot`
- `usedHours` = Σ(`TimeEntry.minutes`/60) for entries in the period
- `remainingHours` = included − used; `pctUsed` = used / included
- `runRateHoursPerDay` = used / elapsed days in period (since `periodStart`)
- `projectedDepletionDate` = now + remaining / runRate (null if runRate ≤ 0 or already depleted)
- `warning` = `pctUsed >= 0.8`

**Money retainer:**
- `deposits` = Σ `RetainerTransaction` where type `deposit` (+ refunds reduce)
- `drawdowns` = Σ type `drawdown`
- `balance` = `Retainer.balance` (authoritative); `pctUsed` = drawdowns / deposits (0 if no deposits)
- `runRatePerDay` = drawdowns over a trailing window (default 90d) / window days
- `projectedDepletionDate` = now + balance / runRate (null if runRate ≤ 0)
- `warning` = `pctUsed >= 0.8`

### Data Layer
- **`hoursRetainers.burndown`** (`protectedProcedure`) → array of hours-retainer burn-down rows
  (active period each), org-scoped.
- **`retainers.burndown`** (`protectedProcedure`) → array of money-retainer burn-down rows.
- Both reuse existing org-scoped queries; the pure function takes plain inputs and is unit-tested
  without a DB.

### UI
New `/reports/retainers/page.tsx` (and a card on the client detail page):
- One card per retainer: client name, type badge (Hours / Prepaid), a progress bar
  (used vs included/deposited), remaining (hours or $), projected depletion date, and an
  **amber "80% used" warning badge** when `warning` is true.
- Hours and money sections, sorted warnings-first.

### Schema Changes
None — all data exists.

---

## Feature 3: Project Health Score

### Problem
There's a per-client health score but nothing at the project level. Users can't see which
projects are in trouble.

### Approach: composite score mirroring `client-health-score.ts`
New pure module `src/server/services/project-health-score.ts` producing a 0–100 composite,
a band (`healthy` / `stable` / `at_risk` / `critical`), per-component sub-scores with weights +
detail strings, and `signals[]` — same shape/conventions as `ClientHealthScore`.

**Five components (weights sum to 1):**

| Component | Weight | Signal |
|---|---|---|
| Budget burn | 0.30 | logged value (hours × rate, or flat amount) vs effective budget (base budget + approved change-order totals); over-budget → low |
| Overdue tasks | 0.20 | share of tasks past `dueDate` and not `isCompleted` |
| Unbilled time | 0.15 | billable hours (per the derivation rule) with no `invoiceLineId`, as a share of billable hours |
| Unpaid invoices | 0.20 | project-attributable open invoices past due (change-order/milestone/billed-time invoices; fall back to the project's client) |
| Client response rate | 0.15 | opened ÷ sent invoice emails for the project's client (reuses the client-health engagement signal) |

`lowData` flag when there's too little history (e.g. no tasks and no time), leaning on neutral
defaults so the score isn't swung by a single data point — same convention as client health.

### Data Layer
- **`projects.healthScore`** (`protectedProcedure`, input `{ projectId }`) — single-project badge.
- **`projects.healthScores`** (`protectedProcedure`) — all active projects for the report.
- Data builders live alongside the existing ones (`analytics-data.ts` style) and feed the pure
  function plain inputs.

### UI
- **Project detail header**: a health badge (score + band color), with a popover breaking down
  the five components — mirrors the client-detail health badge.
- New **`/reports/project-health/page.tsx`**: table of projects with composite score, band, and
  the component sub-scores; sorted worst-first. Mirrors the client-health report page.

### Schema Changes
None.

---

## Feature 4: Utilization Report

### Problem
No view of billable vs non-billable time. The existing `reports.timeTracking` only sums
`minutes × project.rate` and silently drops entries without a project.

### Approach: derived billable classification + grouping
New **`reports.utilization`** procedure + a pure helper `classifyBillable(entry)`:
- **Billable** = entry has a `projectId` on a **non-flat-rate** project with `rate > 0`,
  **or** has a `retainerId` (hours-retainer work).
- **Non-billable** = no project, a flat-rate project (fixed price — hours don't bill),
  rate 0, or unassigned/internal time.

Input: date range + `groupBy` (`week` | `month`) + `dimension` (`client` | `project` | `user`).
Returns per group: `billableHours`, `nonBillableHours`, `totalHours`,
`utilizationPct = billable / total`, plus an overall summary row.

```typescript
{
  groupBy: "week" | "month",
  dimension: "client" | "project" | "user",
  rows: Array<{ key: string; label: string; billableHours: number;
                nonBillableHours: number; totalHours: number; utilizationPct: number }>,
  summary: { billableHours: number; nonBillableHours: number;
             totalHours: number; utilizationPct: number }
}
```

### UI
New **`/reports/utilization/page.tsx`**:
- Controls: date range (existing `ReportFilters`), period toggle (Week / Month), dimension
  toggle (Client / Project / User).
- Summary cards: Overall Utilization %, Billable Hours, Non-billable Hours.
- Table: group label, billable / non-billable / total hours, utilization % (bar or pill).

### Schema Changes
None — billable is derived. (If the org later wants per-entry overrides, an explicit
`TimeEntry.billable` flag is a clean follow-up; out of scope here.)

---

## Navigation
Add three report links — **Utilization**, **Project Health**, **Retainer Burn-down** — to the
reports surface (`reports/page.tsx`) alongside the existing reports. Change orders are reached
from the project detail page (no top-level nav item).

## Testing
- **Pure functions** unit-tested without a DB (vitest), following existing
  `client-health-score` / reports-procedure test patterns:
  `project-health-score`, `retainer-burndown` (hours + money, depletion math, 80% threshold,
  zero/edge run-rates), `classifyBillable` + utilization grouping (week/month boundaries,
  flat-rate exclusion, retainer inclusion, divide-by-zero on 0 total hours).
- **Router procedure tests** mirror `routers-reports-procedures.test.ts` for the new procedures
  (org scoping, date filtering).
- **Change orders**: create forces `ESTIMATE` + `isChangeOrder` + `projectId`; list filter;
  conversion still gated on `ACCEPTED`; cross-tenant project reference rejected (parity with the
  existing cross-tenant client-reference guard, commit f7f22b1).

## Edge Cases
- Hours retainer with no active period → omit from burn-down (nothing to project).
- Money retainer with no deposits → `pctUsed = 0`, no depletion projection, no warning.
- Run-rate ≤ 0 (no recent usage) → `projectedDepletionDate = null` (shown as "—").
- Utilization with 0 total hours in a group → `utilizationPct = 0`, no NaN.
- Project with no tasks/time/invoices → `lowData = true`, provisional neutral score.
- Change order on an archived/closed project → allowed (scope can change late), surfaces in list.
- `projectId` on Invoice is `SetNull` on project delete → orphaned change orders keep their data.
