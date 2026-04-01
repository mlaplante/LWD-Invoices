# Feature B: Deposit Requests

## Summary

A "Require deposit" toggle on the invoice form that auto-creates a two-part payment schedule — deposit due immediately, remainder due on the invoice due date. Uses the existing `PartialPayment` system.

## Design

### Org-level default

- Add `defaultDepositPercent` (nullable Int) to `Organization` model
- When null → deposit toggle off by default. When set (e.g., 50) → toggle defaults to on with that %
- Configurable in Settings > Invoices

### Invoice form UX

- New "Require deposit" toggle below line items / above notes
- When toggled on, shows a % input (prefilled from org default)
- On save, auto-generates two `PartialPayment` entries:
  - Installment 1: `isPercentage: true`, `amount: depositPercent`, `sortOrder: 0`, `dueDate: null` (due immediately)
  - Installment 2: `isPercentage: true`, `amount: 100 - depositPercent`, `sortOrder: 1`, `dueDate: invoice.dueDate`
- If user already has a custom payment schedule, the toggle is hidden (manual management)
- Toggling off removes the auto-generated schedule

### What it doesn't change

- Existing payment schedule dialog still works for manual multi-installment setups
- Portal and `/pay` checkout flow already handle partial payments
- Stripe webhook already marks partial payments as paid
- No "blocking" of send — invoice sends normally, schedule shows deposit due first

## Data changes

- `Organization.defaultDepositPercent Int?` (nullable, migration needed)

## Files to create/modify

- `prisma/schema.prisma` — add field to Organization
- Migration SQL
- `src/server/routers/organization.ts` — include in get/update
- `src/components/invoices/InvoiceForm.tsx` — deposit toggle + % input
- `src/app/(dashboard)/settings/invoices/page.tsx` — default deposit % setting
