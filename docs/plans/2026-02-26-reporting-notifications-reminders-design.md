# Design: Reporting Expansion, Comment Notifications, Payment Terms & Reminder Timing

**Date:** 2026-02-26
**Status:** Approved

## Overview

Four feature areas:
1. Reporting holes — P&L, invoice aging, time tracking report, invoice CSV export
2. Comment/reply notification email — email + in-app when client posts on portal
3. Configurable payment reminder timing — org default + per-invoice override
4. Default payment terms — named terms at org and client level, auto-populates invoice due date

---

## 1. Schema Changes

One migration adding fields to three models.

### Organization
```prisma
defaultPaymentTermsDays Int   @default(30)      // net days after invoice date
paymentReminderDays     Int[] @default([1, 3])  // days before due to send reminders
```

### Client
```prisma
defaultPaymentTermsDays Int?  // null = inherit org default
```

### Invoice
```prisma
reminderDaysOverride Int[]    // empty = use org default
```

PostgreSQL native `Int[]` arrays — no JSON encoding. Single migration file.

---

## 2. Reporting

### 2a. Profit & Loss Report

**Route:** `/reports/profit-loss`
**tRPC:** `reports.profitLoss({ from, to })`

Query: payments (revenue) + expenses for date range, grouped by month using existing `groupByMonth` helper.

Returns:
```ts
{
  revenueByMonth: Record<string, number>   // YYYY-MM → amount
  expensesByMonth: Record<string, number>  // YYYY-MM → amount
  netByMonth: Record<string, number>       // YYYY-MM → revenue - expenses
  totalRevenue: number
  totalExpenses: number
  netIncome: number
}
```

UI: dual-series bar chart (revenue vs expenses) + net income line + summary totals row at top.

### 2b. Invoice Aging Report

**Route:** `/reports/aging`
**tRPC:** `reports.invoiceAging()`

Query: all non-archived invoices with status SENT | PARTIALLY_PAID | OVERDUE, include client and currency.

Bucket by days past due date (computed at query time):
- **Current** — dueDate >= today (not yet due)
- **1–30 days** — 1–30 days past due
- **31–60 days**
- **61–90 days**
- **90+ days**

Returns: `{ current, days1_30, days31_60, days61_90, days90plus }` each containing invoice rows with totals.

UI: summary row at top with total per bucket, expandable table rows per bucket.

### 2c. Time Tracking Report

**Route:** `/reports/time`
**tRPC:** `reports.timeTracking({ from, to })`

Query: `TimeEntry` records for org in date range, include project (with client name) and task.

Aggregated by project: total minutes, billable amount (project rate × hours), project name, client name.

Returns:
```ts
Array<{
  projectId: string
  projectName: string
  clientName: string
  totalMinutes: number
  billableAmount: number
}>
```

UI: sortable table with hours, billable total, and date range filter.

### 2d. Invoice CSV Export

**Route:** `GET /api/reports/invoices/export`

Auth via Supabase (same pattern as `/api/reports/expenses/export`). Queries all non-archived invoices with client and currency, formats as CSV.

Columns: Number, Type, Status, Client, Date, Due Date, Subtotal, Tax, Total, Paid, Balance

UI: "Export CSV" button added to `/reports/page.tsx` header (alongside existing report links).

---

## 3. Comment Notifications

### Trigger
`portal.addComment` (public procedure) — fires when a client posts a comment via the invoice portal.

### Actions after comment is saved
1. Load invoice with `{ number, organization: { users: true }, client: { name, email } }`
2. Send `InvoiceCommentEmail` to each org user email
3. Create `INVOICE_COMMENT` in-app notification for each org user via existing `notifyOrgAdmins` service

### Email template
**File:** `src/emails/InvoiceCommentEmail.tsx`

Content:
- Subject: `New comment on Invoice #[number] from [author name]`
- Body: author name, comment body, invoice number, "View Invoice" button linking to `/invoices/[id]`

### No schema changes needed
`INVOICE_COMMENT` already exists in `NotificationType` enum.

---

## 4. Payment Reminder Timing

### Cron changes (`src/inngest/functions/payment-reminders.ts`)

Replace hardcoded `{ gte: tomorrow, lte: in3Days }` with:

1. Load all SENT/PARTIALLY_PAID invoices with `dueDate >= tomorrow` and `dueDate <= 90 days out`, including `{ organization: { select: { paymentReminderDays: true } } }`
2. For each invoice:
   - Compute `daysUntilDue`
   - Determine effective reminder days: `invoice.reminderDaysOverride.length > 0 ? invoice.reminderDaysOverride : invoice.organization.paymentReminderDays`
   - Send email only if `effectiveReminderDays.includes(daysUntilDue)`

This keeps the cron simple and org-agnostic while supporting per-invoice overrides.

### Settings UI additions

**Org settings page** (`OrgSettingsForm`): checkbox group for reminder days — preset options: 1, 2, 3, 5, 7, 14, 30. Updates `organization.paymentReminderDays`.

**Invoice editor**: collapsible "Reminder schedule" section. Toggle: "Use org default" (checked by default). When unchecked, shows same checkbox group. Updates `invoice.reminderDaysOverride`.

---

## 5. Default Payment Terms

### Named terms mapping (UI only, stored as integer days)
| Label | Days |
|---|---|
| Due on receipt | 0 |
| Net 7 | 7 |
| Net 14 | 14 |
| Net 15 | 15 |
| Net 30 | 30 |
| Net 45 | 45 |
| Net 60 | 60 |
| Net 90 | 90 |
| Custom | user-entered integer |

### Org settings
Dropdown in `OrgSettingsForm` sets `organization.defaultPaymentTermsDays`. Default: Net 30 (30).

### Client settings
Dropdown in client create/edit form sets `client.defaultPaymentTermsDays`. Includes "Use org default" option (null value).

### Invoice creation auto-populate
When a client is selected in the invoice editor:
- If client has `defaultPaymentTermsDays` → use it
- Else use org's `defaultPaymentTermsDays`
- Set `dueDate = invoiceDate + effectiveDays`
- User can still override `dueDate` manually

---

## Files to Create

| File | Purpose |
|---|---|
| `src/emails/InvoiceCommentEmail.tsx` | Comment notification email template |
| `src/app/(dashboard)/reports/profit-loss/page.tsx` | P&L report page |
| `src/app/(dashboard)/reports/profit-loss/loading.tsx` | P&L skeleton |
| `src/app/(dashboard)/reports/aging/page.tsx` | Aging report page |
| `src/app/(dashboard)/reports/aging/loading.tsx` | Aging skeleton |
| `src/app/(dashboard)/reports/time/page.tsx` | Time tracking report page |
| `src/app/(dashboard)/reports/time/loading.tsx` | Time tracking skeleton |
| `src/app/api/reports/invoices/export/route.ts` | Invoice CSV export API |
| `prisma/migrations/[timestamp]_payment_terms_reminders/migration.sql` | DB migration |

## Files to Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 4 new fields across 3 models |
| `src/server/routers/reports.ts` | Add profitLoss, invoiceAging, timeTracking queries |
| `src/server/routers/organization.ts` | Expose + update defaultPaymentTermsDays, paymentReminderDays |
| `src/server/routers/clients.ts` | Add defaultPaymentTermsDays to create/update |
| `src/server/routers/invoices.ts` | Add reminderDaysOverride; auto-populate dueDate on create |
| `src/server/routers/portal.ts` | Add email + in-app notification to addComment |
| `src/inngest/functions/payment-reminders.ts` | Configurable reminder days logic |
| `src/components/settings/OrgSettingsForm.tsx` | Add payment terms + reminder days fields |
| `src/app/(dashboard)/reports/page.tsx` | Add links to new report pages + invoice export button |
| `src/app/(dashboard)/clients/[id]/page.tsx` (or form) | Add payment terms dropdown |
| Invoice editor form | Add reminder override section + auto-populate due date |
