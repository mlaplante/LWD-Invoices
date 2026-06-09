# UX / Polish — Command Palette Actions, Dashboard Customization, Keyboard Invoice Editor, Global Activity Feed, Mobile Flows, Accessibility

**Date**: 2026-06-09
**Status**: Approved

---

## Overview

Roadmap item #12 ("UX / polish") bundles six independent features. They ship **in one pass but as seven coordinated workstreams**, not one monolithic PR. The ordering is driven by two code collisions discovered during design:

1. **Palette actions (#1) and mobile flows (#5)** both need _send-reminder_, _log-expense_, and _start-timer_. These are built **once** as shared headless action primitives (WS1) and consumed by both surfaces (WS3, WS4).
2. **Keyboard invoice editor (#3) and the accessibility pass (#6)** both rewrite `InvoiceForm.tsx` (724 lines) and `LineItemEditor.tsx` (616 lines). They are done as **one coordinated editor pass** (WS2) to avoid touching the same code twice.

Build order: **foundation (WS1, WS2) → surfaces (WS3, WS4) → independent pieces (WS5, WS6) → cross-cutting a11y (WS7)**.

### Decisions locked during brainstorming
- Dashboard layout is persisted in a **new Prisma model** (`UserDashboardPreference`), not localStorage — layout follows the user across devices.
- The global feed **adds audit logging to `projects.ts` and `tickets.ts`** so it genuinely covers all five promised entity types (new rows going forward; no backfill).
- **F5 (react-hook-form migration) is OUT of scope** — it is a broad refactor not in the accessibility ask.

### Cross-cutting constraints (apply to every workstream)
- **Multi-tenancy**: every new query/mutation is org-scoped via `ctx.orgId` (and user-scoped where per-user, e.g. dashboard prefs, timers). Follow the existing inline `where: { organizationId: ctx.orgId }` pattern.
- **Timers bind to a `taskId`** — there is no task-less timer (`timers.start` requires `taskId`). Any "start timer" entry point must route through a Project → Task picker.
- **No new dependencies** beyond what's already present (`cmdk`, `@dnd-kit/*`, shadcn/ui, tRPC, Zod).

---

## WS1 — Shared action primitives  *(foundation for #1, #5)*

Headless, self-contained components under `src/components/actions/`. Each is a controlled component (`open` / `onOpenChange`) so it can be mounted by the command palette, the mobile drawer, or anywhere else. Each has one clear job, communicates through props, and carries no surface-specific assumptions.

| Component | Responsibility | Reuses |
|---|---|---|
| `<QuickExpenseSheet>` | Minimal log-expense form: amount, supplier (combobox), category, date, optional receipt upload. Submits via existing `expenses.create`. | `expenses.create`, existing supplier/category selects |
| `<SendReminderInvoicePicker>` | Searchable open-invoice picker that, on selection, feeds the **existing** `CollectionsReminderDialog` (which already does smart-draft + tone + fact-guarded send). New code is just the picker + wiring `invoiceId` in. | `CollectionsReminderDialog`, `collections.draftReminder`, `collections.sendReminder` |
| `<StartTimerFlow>` | Project → Task picker (required) → `timers.start({ taskId })`. Shows currently-running timer if one exists. | `timers.start` / `timers.getUserTimers`, `projects.list`, `tasks.list` |
| `<GenerateReportMenu>` | List report types → navigate to the report page (export already lives there). | `next/navigation` router; `/reports/*` routes |

"Create invoice" remains a navigation to `/invoices/new` (the editor is the correct surface — not a modal).

**Interface contract**: each primitive accepts `{ open: boolean; onOpenChange: (o: boolean) => void; onCompleted?: () => void }`. `onCompleted` lets the host close its own surface (palette/drawer) after a successful action.

**Testing**: each primitive gets a component-level test asserting it calls the right tRPC mutation with org-scoped input and fires `onCompleted` on success.

---

## WS2 — Invoice editor pass  *(#3 + a11y F2, F4, F7)*

One coordinated rewrite of `InvoiceForm.tsx` + `LineItemEditor.tsx`.

### Component extraction (F4)
Split the two oversized files into focused units:
- `<InvoiceMetadata>` — client, dates, type, currency, notes.
- `<PaymentScheduleSection>` — payment-schedule / partial terms.
- `<LineItemRow>` — **memoized** single row (description, qty, rate, tax, amount). Memoization matters for keyboard entry responsiveness with many rows.
- `LineItemEditor` becomes the row orchestrator (add/remove/reorder/totals) only.

### Hydration fix (F2)
Move `new Date()` / `Math.random()` out of `useState` initializers into `useEffect` so server and client render identically. Applies to `InvoiceForm.tsx` (and the same pattern in `TimeEntryForm.tsx`, `MfaEnrollment.tsx` — folded in here since they share the bug).

### Keyboard-first entry (#3)
- **Enter** in the last field of a row → commit row + create a new empty row, focus its first field.
- **Tab / Shift+Tab** flow across cells left-to-right, top-to-bottom.
- **⌘/Ctrl+D** → duplicate current row.
- **⌘/Ctrl+Backspace** (or a delete affordance) → remove current row.
- A small **"keyboard shortcuts" popover** documenting the above.
- Refs-based focus management; no global key listener that could leak outside the editor.

### Copy previous invoice (#3)
- "Copy from previous" control on the editor: given the selected client, fetch their most recent invoice and prefill line items + metadata (not number/dates).
- New (or extended) query: `invoices.lastForClient({ clientId })` returning the line-item shape the editor consumes. Org-scoped.

### Keyboard / SR drag-reorder (F7)
- Add DnD-Kit `KeyboardSensor` to the existing reorder so rows can be moved via keyboard.
- `aria-live="polite"` announcer ("Row 2 moved to position 1 of 5").

**Testing**: extraction is behavior-preserving (existing invoice-form tests stay green); new tests for Enter-to-new-row, duplicate, copy-previous prefill shape, and keyboard reorder announcement.

---

## WS3 — Command palette actions  *(#1)*

Extend `src/components/layout/CommandPalette.tsx`.

- Add an **"Actions"** `Command.Group` listing: Create invoice, Send reminder, Log expense, Start timer, Generate report.
- Introduce a lightweight **palette mode** state: selecting an in-place action (send reminder, log expense, start timer) mounts the corresponding WS1 primitive _inside_ the palette dialog (or as a stacked dialog), so the user never leaves the keyboard. "Create invoice" and "Generate report" navigate.
- On primitive `onCompleted`, close the palette.
- Preserve existing search behavior (`shouldFilter={false}`, debounced `search.global`).

**Testing**: selecting each action opens the right primitive / navigates to the right route; palette closes on completion.

---

## WS4 — Mobile flows  *(#5)*

Wire WS1 primitives into the mobile UI (`MobileNav.tsx` drawer + relevant mobile pages).

- **Quick expense capture** — entry in the mobile drawer opens `<QuickExpenseSheet>`.
- **Start/stop timer** — drawer entry opens `<StartTimerFlow>`; if a timer is running, show stop affordance.
- **Send reminder** — drawer entry opens `<SendReminderInvoicePicker>` → existing `CollectionsReminderDialog`.
- **Unpaid invoices quick view** — a mobile route/section filtered to open + overdue invoices (reuses existing invoice list query with a status filter).

No change to the bottom tab bar's four primary tabs; new actions live in the "More" drawer to avoid crowding.

**Testing**: drawer entries mount the correct primitives; unpaid view applies the open/overdue filter.

---

## WS5 — Dashboard widget customization  *(#2)*

### Schema change
New Prisma model:
```prisma
model UserDashboardPreference {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  layoutJson     String   // JSON: ordered array of { key, visible }
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([userId, organizationId])
  @@index([organizationId])
}
```
Per-(user, org) so a user in multiple orgs gets independent layouts. Migration required.

### Widget registry
`src/components/dashboard/widget-registry.ts` maps a stable `key` → `{ label, component, loader }`. Cards covered: **cash flow, overdue invoices, revenue, tasks, retainer burn, expenses** (mapped to existing dashboard sections/components where they already exist; add the missing ones, e.g. "tasks", "retainer burn", as thin cards over existing queries).

### Data layer
- `dashboard.getLayout()` — returns the user's saved layout or a default ordering.
- `dashboard.saveLayout({ layout })` — upserts `UserDashboardPreference`. Validates keys against the registry (Zod enum derived from registry keys).

### UI
- An **"Edit layout"** toggle on the dashboard enters edit mode: a client island renders cards with visibility toggles + drag-reorder (DnD-Kit, keyboard-accessible per WS7 standards).
- Default (non-edit) render honors the saved layout: hidden cards omitted, order applied.
- The current server-component dashboard sections are wrapped so the saved order/visibility drives which Suspense sections render.

**Scope boundary (YAGNI)**: show/hide + reorder only. **No drag-to-resize, no multi-column custom grids.**

**Testing**: `saveLayout` rejects unknown keys; `getLayout` returns default when none saved; visibility/order round-trips.

---

## WS6 — Global activity feed  *(#4)*

### Audit coverage gap (must fix first)
`AuditLog` is currently written for Invoice, Client, Expense, CreditNote, payments (PartialPayment), Contractor, Dispute, HoursRetainer, etc. — **but NOT Projects or Tickets**. Add `logAudit(...)` calls to `projects.ts` and `tickets.ts` create/update/delete/status mutations, following the existing pattern (`entityType: "Project"` / `"Ticket"`, `entityLabel`, `action`). New rows only; no backfill.

### Page
New `/activity` route (top-level dashboard page, linked from nav):
- Unified timeline over `AuditLog`, **org-scoped**, newest first.
- **Filters**: entity type (multi), action, date range. Server-driven via an extended `auditLog.list` (add optional `action`, `from`, `to`, and multi `entityType` filters; keep the existing 100-cap pagination via `limit`/`offset`).
- **Pagination**: "load more" using the existing `offset`.
- Presentation reuses/extends `ActivityFeed.tsx` (add entity links so each row deep-links to the entity).

**Distinction from the admin audit-log settings page**: `/settings/audit-log` stays the admin/compliance view; `/activity` is the user-facing operational timeline. They share the same data source and `auditLog.list` procedure.

**Testing**: filter combinations produce correct `where` clauses; org-scoping enforced; pagination advances.

---

## WS7 — Remaining accessibility  *(#6, cross-cutting)*

- **F1 — label association**: replace bare `<label>` with the existing `<Label htmlFor=…>` in `RetainerForm.tsx`, `TimeEntryForm.tsx`, and any other forms found via grep. Each input gets a stable `id`.
- **F3 — skip link**: add `<a href="#main" className="sr-only focus:not-sr-only …">Skip to main content</a>` at the top of `(dashboard)/layout.tsx` and `id="main"` on the `<main>` element.
- **F6 — bulk-selection dedup**: extract `useBulkSelection<T>(items)` hook and use it in both `InvoiceTableWithBulk.tsx` and `InvoiceMobileListWithBulk.tsx` (removes duplicated select-all/toggle/clear logic).
- **(F2, F4, F7 are delivered in WS2.)**

**Testing**: label/`htmlFor` associations assertable in component tests; `useBulkSelection` unit-tested (select all, toggle, clear, partial state).

---

## Out of scope (explicit)
- react-hook-form / zodResolver form migration (audit F5).
- Drag-to-resize or free-form grid dashboard widgets.
- Direct background-export from the palette's "Generate report" (it navigates).
- Backfilling historical audit rows for projects/tickets.
- Any new third-party dependency.

## Build sequencing summary
1. **WS1** action primitives (unblocks WS3, WS4)
2. **WS2** invoice editor pass (absorbs a11y F2/F4/F7)
3. **WS3** palette actions
4. **WS4** mobile flows
5. **WS5** dashboard customization (schema + island)
6. **WS6** global feed (audit coverage + page)
7. **WS7** remaining a11y (F1/F3/F6)

Each workstream lands typecheck-clean with its tests green before the next begins.
