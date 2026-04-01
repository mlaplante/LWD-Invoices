# Feature C: Smart Payment Nudges

## Summary

Skip pre-due reminders for reliable clients. Before sending a reminder step with `daysRelativeToDue < 0`, check the client's payment history. If 80%+ of their invoices were paid on or before the due date, skip it. Post-due reminders always send.

## Design

### Org-level settings

- `smartRemindersEnabled Boolean @default(false)` on Organization
- `smartRemindersThreshold Int @default(80)` on Organization (% of invoices paid on time)
- Toggle + threshold input in Settings > Reminders

### Reminder execution logic

In the Inngest reminder function, before sending a pre-due step:

1. Count client's paid invoices (status = PAID)
2. Of those, count how many were paid on or before `dueDate`
3. If `onTimeCount / totalPaidCount >= threshold`, skip this step
4. Clients with < 3 paid invoices always get all reminders (not enough data)
5. Post-due steps (`daysRelativeToDue >= 0`) always execute

### Visibility

- Client detail page: "Reliable payer" badge when client qualifies
- Reminder log: mark skipped steps as "Skipped (reliable client)"

### What it doesn't do

- No per-client override
- No client score UI or analytics
- No changes to reminder sequence templates
- No changes to email automation triggers

## Data changes

- `Organization.smartRemindersEnabled Boolean @default(false)`
- `Organization.smartRemindersThreshold Int @default(80)`

## Files to create/modify

- `prisma/schema.prisma` — add fields to Organization
- Migration SQL
- `src/server/routers/organization.ts` — include in get/update
- `src/server/services/client-payment-score.ts` — pure function to calculate on-time %
- `src/inngest/functions/reminder-sequences.ts` — add skip logic before pre-due sends
- `src/app/(dashboard)/settings/reminders/page.tsx` or equivalent — settings UI
- `src/app/(dashboard)/clients/[id]/page.tsx` — reliable payer badge
