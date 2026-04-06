# Profitability, Milestone Auto-Drafting & Revenue Forecasting

**Date**: 2026-04-06
**Status**: Approved

---

## Feature 1: Profitability per Client/Project

### Problem
The app has org-level P&L (`reports.profitLoss`) but no way to see which clients or projects are profitable. Users need margin visibility to make business decisions.

### Approach: Client-level attribution
Invoices belong to clients (no `projectId` on Invoice), so client-level revenue attribution is accurate. Per-project revenue is only available for invoices created through the time/expense billing flow — this is expected and will be labeled clearly in the UI.

### Data Layer

**`reports.profitabilityByClient`** procedure:
- **Revenue**: `Payment` records joined through `Invoice.clientId`, grouped by client. Filtered by `paidAt` within date range.
- **Costs**: `Expense` records joined through `Project.clientId` + `TimeEntry` cost calculated as `(minutes/60) * project.rate`, grouped by client.
- **Returns**: `Array<{ clientId, clientName, revenue, costs, margin, marginPercent }>`

**`reports.profitabilityByProject`** procedure:
- **Revenue**: Sum of `Payment` amounts for invoices where `InvoiceLine` links to the project via `TimeEntry.projectId` or `Expense.projectId`. Only captures revenue from billed time/expenses.
- **Costs**: `Expense` + `TimeEntry` cost directly on the project.
- **Returns**: `Array<{ projectId, projectName, clientName, revenue, costs, margin, marginPercent }>`

### UI

New `/reports/profitability/page.tsx`:
- Two tabs: "By Client" and "By Project"
- Table columns: Name, Revenue, Costs, Margin ($), Margin (%)
- Sortable columns
- Summary cards at top: Total Revenue, Total Costs, Total Margin, Avg Margin %
- Uses existing `ReportFilters` date range component

### Schema Changes
None — all data already exists.

---

## Feature 2: Auto-Drafting from Milestones

### Problem
Milestones exist as organizational groupings for project tasks, but there's no way to automatically generate an invoice when a milestone is completed. Users must manually create invoices for fixed-price project stages.

### Approach: Fixed-price milestone billing
Add monetary fields to Milestone. When marked complete with `autoInvoice` enabled, auto-create a DRAFT invoice with a single line item for the milestone amount.

### Schema Changes

Add to `Milestone` model:
```
amount        Decimal?
completedAt   DateTime?
autoInvoice   Boolean   @default(false)
invoiceId     String?   @unique
invoice       Invoice?  @relation(fields: [invoiceId], references: [id])
```

Add to `Invoice` model:
```
milestone     Milestone?
```

### Trigger Flow

1. User clicks "Mark Complete" on a milestone.
2. `milestones.complete` tRPC mutation sets `completedAt = now()`.
3. If `autoInvoice === true` and `amount` is set:
   - Create a DRAFT invoice for the milestone's `project.client`.
   - Single line item: milestone name as description, milestone amount as unit price, qty 1.
   - Set `milestone.invoiceId` to the new invoice's ID.
4. The draft appears in the invoices list for user review before sending.

No Inngest/background job needed — synchronous action triggered by user.

### UI Changes

**`MilestoneForm.tsx`**:
- Add `amount` field (currency input)
- Add `autoInvoice` checkbox: "Auto-create draft invoice on completion"
- `autoInvoice` only shows when `amount` is filled

**Milestone list in project detail**:
- "Mark Complete" button/action on incomplete milestones
- Completed milestones show checkmark + completion date
- If invoice was generated, show link: "Invoice #1042"
- "Reopen" action on completed milestones (clears `completedAt`, does NOT delete generated invoice)

---

## Feature 3: Revenue Forecasting (Pipeline-based)

### Problem
The app shows historical revenue and invoices due in 7 days, but no forward-looking view of expected cash flow. Users can't see what's in the pipeline.

### Approach: Pipeline-based forecast
Combine outstanding invoices (by due date) with projected recurring invoice generations. Pure math — no predictive modeling. Shows "what you're owed" and "what's scheduled."

### Data Layer

**`reports.revenueForecast`** procedure. Params: `months` (default 6).

**Step 1 — Outstanding invoices**: Query all SENT + PARTIALLY_PAID invoices. For each:
- Amount = `total - amountPaid` (remaining balance)
- Bucket by `dueDate` month
- Overdue invoices (dueDate in the past) bucket into current month as "overdue"

**Step 2 — Recurring projections**: Query all active `RecurringInvoice` records. For each:
- Iterate `computeNextRunAt` from current `nextRunAt` up to the forecast horizon
- Respect `endDate` and `maxOccurrences` limits
- Amount = template invoice's `total` per generation

**Returns**:
```typescript
{
  months: Array<{
    month: string        // "YYYY-MM"
    outstanding: number  // from open invoices
    recurring: number    // from recurring projections
    total: number        // outstanding + recurring
  }>
  summary: {
    totalOutstanding: number
    totalRecurring: number
    grandTotal: number
    overdueAmount: number
  }
}
```

### UI

New `/reports/forecast/page.tsx`:
- **Chart**: Stacked bar chart per month — outstanding (blue) + recurring (green)
- **Summary cards**: Total Pipeline, Recurring (next N months), Combined Forecast, Overdue
- **Table**: Monthly breakdown rows with outstanding, recurring, total columns
- **Horizon selector**: 3 / 6 / 12 months (replaces date range picker for this report)

### Schema Changes
None — all data already exists.

### Edge Cases
- Recurring invoices with `endDate` or `maxOccurrences` — stop projecting past those limits
- Partially paid invoices — only count remaining balance
- Overdue invoices — bucket in current month, flagged separately in summary
- No recurring invoices — forecast shows only outstanding pipeline (still useful)

---

## Navigation

Add "Profitability" and "Forecast" links to the reports navigation/sidebar alongside existing report pages (Profit & Loss, Aging, Time, etc.).
