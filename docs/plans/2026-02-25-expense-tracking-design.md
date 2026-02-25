# Expense Tracking Section — Design

**Date:** 2026-02-25
**Status:** Approved

## Overview

Add a dedicated `/expenses` section to the dashboard for tracking all business expenses — including standalone expenses not tied to any project (e.g. rent, subscriptions, utilities).

The existing `Expense` model, `ExpenseCategory`, and `ExpenseSupplier` tables are reused. The only schema change is making `projectId` optional and adding two new fields.

## Schema Changes

File: `prisma/schema.prisma` — `Expense` model

| Change | Details |
|--------|---------|
| `projectId` → nullable | `projectId String?` — existing project expenses unaffected |
| Add `paidAt DateTime?` | When the expense was actually paid |
| Add `reimbursable Boolean @default(false)` | Whether the expense can be billed back to a client |

Requires a Prisma migration (`prisma migrate dev`).

## API Changes

File: `src/server/routers/expenses.ts`

- **`expenses.list`** — `projectId` becomes optional input. When omitted, returns all org-level expenses (for the new section). When provided, scopes to that project (existing project views unchanged).
- **`expenses.create`** — `projectId` becomes optional. Adds `paidAt` (optional date) and `reimbursable` (boolean, default false).
- **`expenses.update`** — Adds `paidAt` and `reimbursable` fields.

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/expenses` | `page.tsx` (server) | Paginated list of all expenses |
| `/expenses/new` | `page.tsx` (server) + form client component | Create form |
| `/expenses/[id]/edit` | `page.tsx` (server) + form client component | Edit form |

### List Page (`/expenses`)

- Table columns: Name, Category, Supplier, Project (if linked), Amount, Paid Date, Reimbursable badge, row actions
- Empty state for no expenses
- Row actions: Edit → `/expenses/[id]/edit`, Delete (with confirm dialog)

### Form Fields (create & edit)

| Field | Type | Required |
|-------|------|----------|
| Name | text | Yes |
| Amount (rate) | number | Yes |
| Qty | integer | No (default 1) |
| Category | select (ExpenseCategory) | No |
| Supplier | select (ExpenseSupplier) | No |
| Tax | select (Tax) | No |
| Project | select (Project) | No |
| Paid Date | date picker | No |
| Reimbursable | checkbox | No |
| Description | textarea | No |
| Payment Details | textarea | No |

## Navigation

File: `src/components/layout/SidebarNav.tsx`

Add **Expenses** nav item with `Wallet` icon to `primaryNav`, between `Items` and the existing items.

```ts
{ href: "/expenses", label: "Expenses", icon: Wallet }
```

## Out of Scope

- Receipt/file attachments (the `Attachment` model exists but is not wired here)
- Bulk import
- Expense approval workflows
