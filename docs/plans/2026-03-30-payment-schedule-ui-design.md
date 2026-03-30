# Payment Schedule UI Design

**Date:** 2026-03-30
**Status:** Approved

## Overview

Add a UI for creating and editing payment schedules (split payments) on invoices. The backend (`partialPaymentsRouter`) already supports `list`, `set`, and `recordPayment` operations. This design adds the missing UI to configure schedules from both the invoice form and the invoice detail page.

## Decisions

- **Approach:** Dialog-based — one shared `PaymentScheduleDialog` component used in both contexts
- **Amount mode:** Mix and match — each installment can independently be a fixed dollar amount or percentage
- **Presets:** Quick-split buttons (2, 3, 4 equal payments) that auto-fill and can be customized
- **Validation:** Warning (not blocking) if amounts don't cover the full invoice total

## Component: PaymentScheduleDialog

### Props

```ts
type PaymentScheduleDialogProps = {
  invoiceId?: string;           // undefined during invoice creation
  invoiceTotal: number;
  invoiceDueDate?: Date | null;
  currencySymbol: string;
  currencySymbolPosition: string;
  existingSchedule?: PartialPayment[];  // pre-fill when editing
  onSave: (schedule: PartialPaymentInput[]) => void;  // callback for form mode
};
```

### Layout

**Top — Quick Presets:**
Row of small buttons: "2 payments", "3 payments", "4 payments". Clicking auto-fills equal percentage installments (e.g., 3 payments → 33.34%, 33.33%, 33.33%). Due dates auto-spaced 30 days apart from invoice due date (or today if none set).

**Middle — Installment List:**
Each row:
- `#` — auto-numbered from position
- Amount — number input
- `$`/`%` toggle — segmented button switching between fixed and percentage per row
- Due Date — date picker
- Notes — optional text input (collapsed by default, expand icon to reveal)
- Remove — trash icon button

Below list: "+ Add Installment" button.

**Bottom — Summary Bar + Actions:**
- Left: "Scheduled: $X / $Y total" (or "X% / 100%") with warning badge if mismatched
- Right: "Cancel" and "Save Schedule" buttons

### Paid Installments

When editing an existing schedule, paid installments are shown grayed out and read-only. They cannot be edited or removed. The "Clear Schedule" option only removes unpaid installments.

## Integration: Invoice Detail Page

- "Payment Schedule" button in the action bar, visible for all non-CREDIT_NOTE types
- If schedule exists: button label changes to "Edit Schedule"
- Dialog opens pre-filled with existing entries
- On save: calls `partialPayments.set` mutation directly, then refreshes the page
- "Clear Schedule" option to remove all unpaid installments

## Integration: Invoice Form

- "Set Up Payment Schedule" button below the line items section
- If schedule configured: shows summary chip (e.g., "3 payments scheduled") with edit/clear actions
- Schedule stored in local form state as an array
- New optional `partialPayments` field on `invoices.create` and `invoices.update` zod schemas
- On invoice save: schedule submitted alongside invoice data; server calls `partialPayments.set` after invoice create/update

## Edge Cases

- **Paid installments immutable:** Shown grayed out in dialog, cannot be edited or removed
- **Invoice total changes after schedule set:** Summary bar recalculates and shows warning if mismatched. No automatic adjustment.
- **Percentage rounding:** Last installment gets the remainder to reach exactly 100% (e.g., 3 payments → 33.34% + 33.33% + 33.33%)
- **No due date on invoice:** Presets use today as starting date for spacing installments
- **Empty schedule save:** Clears all unpaid installments (equivalent to removing the schedule)

## Files to Create/Modify

### New
- `src/components/invoices/PaymentScheduleDialog.tsx` — the shared dialog component

### Modified
- `src/app/(dashboard)/invoices/[id]/page.tsx` — add "Payment Schedule" / "Edit Schedule" button
- `src/components/invoices/InvoiceForm.tsx` — add schedule button + local state + submit integration
- `src/server/routers/invoices.ts` — accept optional `partialPayments` on create/update mutations
