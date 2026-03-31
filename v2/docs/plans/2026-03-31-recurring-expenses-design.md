# Recurring Expenses Design

## Summary

Add recurring expense support so users can define expense templates that auto-generate new expense records on a schedule. Follows the same pattern as the existing `RecurringInvoice` model.

## Decisions

- **Template-based**: A `RecurringExpense` record acts as a template; real `Expense` records are auto-created on schedule.
- **Frequencies**: Reuses the existing `RecurringFrequency` enum (DAILY, WEEKLY, MONTHLY, YEARLY) with an interval multiplier.
- **Generated expenses start unpaid**: No auto-marking as paid.
- **Dual trigger**: On-page-load catch-up (in `expenses.list`) + dedicated cron endpoint.

## Data Model

### New model: `RecurringExpense`

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| name | String | Copied to generated expense |
| description | String? | Copied to generated expense |
| qty | Int @default(1) | Copied to generated expense |
| rate | Decimal | Copied to generated expense |
| reimbursable | Boolean @default(false) | Copied to generated expense |
| frequency | RecurringFrequency | DAILY, WEEKLY, MONTHLY, YEARLY |
| interval | Int @default(1) | Every N periods |
| startDate | DateTime | When recurrence begins |
| nextRunAt | DateTime | Next scheduled creation date |
| endDate | DateTime? | Optional stop date |
| maxOccurrences | Int? | Optional limit |
| occurrenceCount | Int @default(0) | How many created so far |
| isActive | Boolean @default(true) | Pause/resume |
| taxId | FK? | Optional tax template |
| categoryId | FK? | Optional category template |
| supplierId | FK? | Optional supplier template |
| projectId | FK? | Optional project template |
| organizationId | FK | Org-scoped (required) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Expense model addition

- `recurringExpenseId` (String?, FK to RecurringExpense) — backlink to template

## Generation Logic

### Core function: `generateDueExpenses(organizationId)`

1. Query `RecurringExpense` where:
   - `isActive = true`
   - `nextRunAt <= now()`
   - No `endDate` or `endDate > now()`
   - No `maxOccurrences` or `occurrenceCount < maxOccurrences`
2. For each match, in a transaction:
   - Create `Expense` with template fields, `dueDate = nextRunAt`, `recurringExpenseId` set
   - Advance `nextRunAt` based on frequency + interval
   - Increment `occurrenceCount`
   - If limit reached or past `endDate`, set `isActive = false`
3. Loop to handle multiple missed occurrences (e.g., if user hasn't logged in for 3 months and expense is monthly, generate 3 expenses)

### Trigger points

- **On-page-load**: `expenses.list` calls `generateDueExpenses` before querying. Quick guard query first to avoid unnecessary work.
- **Cron endpoint**: `POST /api/cron/recurring-expenses` — iterates all orgs with due recurring expenses. Secured with `CRON_SECRET` header.

### Idempotency

`nextRunAt` advancement is atomic with expense creation (same transaction), preventing duplicates from concurrent triggers.

## tRPC Router: `recurringExpenses`

| Procedure | Type | Description |
|-----------|------|-------------|
| list | query | All recurring expenses for org, with relations |
| getById | query | Single recurring expense + generated expense history |
| create | mutation | Create template with schedule fields |
| update | mutation | Partial update; recalculates `nextRunAt` if schedule changes |
| delete | mutation | Remove template (generated expenses remain standalone) |
| toggleActive | mutation | Pause/resume recurrence |

## UI

### New pages

- `/expenses/recurring` — List view: name, amount, frequency, next run, status, occurrence count
- `/expenses/recurring/new` — Create form (expense fields + frequency/interval/start/end/max)
- `/expenses/recurring/[id]/edit` — Edit form

### Existing page changes

- Expenses list page: Add "Recurring" tab/link to `/expenses/recurring`
- Expense list items: Show recurring icon + template link for generated expenses
- Recurring expense detail: Show history of generated expenses
