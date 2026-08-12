# Performance Optimizations — 2026-08-11

**Scope:** Server-side query batching, request-level parallelism, and payload
trimming across `src/server/routers`, `src/server/services`, and
`src/inngest/functions`. Follow-up to `2026-06-24-performance-tuning-pass.md`
(which fixed the collections and project-health N+1s and paginated
`tickets.list`) and to `AUDIT-2026-05.md`'s performance roadmap.

**Verification ceiling:** This pass was done in a sandbox with **no database**.
Every change below is structural — reasoned from query shape, type-checked
(`tsc --noEmit` clean), and covered by the full Vitest suite (2268/2268 green,
up-to-date with the refactors) — but **not measured against real data**. Query
counts quoted are arithmetic from the code, not profiler output. Anything
described as a win should be confirmed with `EXPLAIN ANALYZE` / real-data
profiling before being cited as measured.

## Implemented in this pass

### Batch writes (N round-trips → 1)

1. **`notifyOrgAdmins` fan-out** (`src/server/services/notifications.ts`) —
   previously 1 org lookup (pulling whole `User` rows via `include`) + one
   `notification.create` per admin, per call. Now a narrowed `select`
   (`id`/`supabaseId` only) + a single `notification.createMany`. A new
   batched `notifyOrgAdminsMany(orgId, notifications[])` does one lookup +
   one `createMany` for an entire bulk operation. Every caller benefits
   (invoices, portal, refunds, automation-runner, invoice-send, crons).
2. **`logAuditMany`** (`src/server/services/audit.ts`) — `createMany` variant
   of `logAudit` for bulk mutations.
3. **`invoices.sendMany`** (`src/server/routers/invoices.ts`) — per-invoice
   dynamic imports hoisted out of the loop; per-invoice `logAudit` +
   `notifyOrgAdmins` (≈ 4 + n_admins queries × 50 invoices) replaced with one
   `auditLog.createMany` + one `notifyOrgAdminsMany` after the send loop.
   Per-invoice status updates and emails unchanged (they carry the per-invoice
   success/failure semantics).
4. **`invoices.markPaidMany`** — receipt emails were sent strictly serially
   (sum of 50 email renders + Resend calls in wall-clock); now concurrent with
   the same per-email error swallowing. Per-invoice audit writes → one
   `logAuditMany`.
5. **`paymentReconciliation.match`** — post-transaction side effects
   (Inngest event, receipt email, audit row per application) ran serially per
   application with a dynamic import inside the loop; now one import, all
   effects concurrent, audit rows in one `createMany`. The in-transaction
   per-application loop is intentionally untouched: applications may target
   the same invoice, and each iteration must see the previous iteration's
   payment rows for `resolvePaymentStatus` to be correct.
6. **`check-in-generator`** (`src/server/services/check-in-generator.ts`) —
   the 30-day and annual passes did `findFirst` + `create` per project
   (2 serial queries × project count, three loops per org per cron run); the
   quarterly pass did `create` per client. Now each pass is one `findMany`
   (existing check-ins → `Set`) + one `createMany`, matching the bulk-loader
   style `analytics-data.ts` established.
7. **`reconcileChargeRefunds`** (`src/server/services/refunds.ts`) —
   `findUnique` + `create`/`update` per Stripe refund on the webhook path →
   single `upsert` on the `@unique stripeRefundId` (also race-safe against
   concurrent webhook retries).
8. **`recurring-expense-generator`** — the org-owner lookup ran inside every
   per-occurrence transaction during catch-up; hoisted to once per template.

### Parallelize independent reads (serial awaits → `Promise.all`)

9. **`sendEmail`** (`src/server/services/email-sender.ts`) — the recipient
   suppression check, CC suppression check, owner-BCC lookup, and
   preferences-token lookup were four sequential awaits; they are mutually
   independent and now run concurrently. Behavioral note: a suppressed send
   now still performs the (discarded) BCC/preferences reads — accepted, since
   suppression is the rare path and the common path drops from 4 serial
   round-trips to 1 round-trip of wall-clock.
10. **`timesheets.list` / `timesheets.summary`** — org `taskTimeInterval`
    lookup + time-entry query now concurrent.
11. **`reports.revenueForecast`** — open-invoices and recurring-invoices
    queries now concurrent.
12. **`getClientCreditStatus`** (`src/server/services/credit-hold.ts`) —
    client row + `computeExposure` now concurrent (halves
    `clients.creditStatus` latency in query terms). The serial write loop at
    `credit-hold.ts:~168` remains intentionally serial per the 2026-06-24
    pass.

### Trim payloads on uncapped report scans

13. **`reports.unpaidInvoices` / `overdueInvoices` / `invoiceAging`** — these
    scan every open invoice in the org (uncapped **by design** — they render
    the full set; see the 2026-06-24 pass for why a `take:` would corrupt
    them). They previously returned all ~45 Invoice scalar columns per row,
    including `signatureData` (encrypted base64 PNG) and `portalToken`,
    over superjson. Now a shared `select` of exactly the fields the report
    pages render (id, number, status, date, dueDate, total, client name,
    currency display fields). Consumers are type-checked against the tRPC
    output type, so any future field use fails `tsc`, not runtime.

### Narrow the cross-org cron scan

14. **`overdue-invoices` self-healing pass** (`src/inngest/functions/`) —
    previously loaded **every** OVERDUE invoice across **all tenants** with
    full `partialPayments` rows, filtered in JS, and updated row-by-row. Now
    the SQL filter requires `partialPayments: { some: { isPaid: false,
    dueDate: { gt: now } } }` (a superset of the JS accept-condition, which
    still runs unchanged on the survivors), selects only the three
    installment fields needed, and applies one `updateMany`. The main
    overdue pass is unchanged: it does inherent per-invoice work (render +
    email + PDF), though its `notifyOrgAdmins` calls got cheaper via (1).

## Not done, with reasons (candidates for a measured pass)

- **`dashboard.summary.agingReceivables` SQL bucketing (AUDIT P1)** and
  **`getTaxLiability` `$queryRaw` rewrite (P2)** — both change financial-math
  code paths from Prisma aggregation to raw SQL; per Gate 3/Gate 5 they need
  a real database to verify equivalence before shipping.
- **PDF caching in Supabase storage (P3)** — needs storage + runtime
  verification; `getOrRenderInvoicePDF` already caches per-process.
- **`sendPaymentReceiptEmail` invoice refetch** — `markPaid`, `sendReceipt`,
  and reconciliation each load the invoice and then the email service reloads
  it by id. An optional pre-loaded-invoice parameter would save one query per
  receipt; deferred because the three call-site include-shapes differ and the
  refactor deserves its own focused review.
- **`projectTemplates.applyToProject` two-phase `createMany`** — doable (the
  hierarchy is one level deep by construction) but changes id-assignment
  ordering inside a transaction; low frequency, deferred.
- **`overdue-invoices` main pass batching by org / `take` cursor** — the scan
  is still unbounded across tenants; bounded batching is worth doing once
  there's real data to size the batches against.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:run` — 2268/2268 across 205 files (4 test files updated to
  match the new query shapes: `select` instead of `include` on the report
  procedures, batched audit/notification mocks, org mock for the email
  sender's concurrent BCC lookup).
- **Not verified:** runtime behavior against a real Postgres/Supabase stack,
  actual latency/throughput deltas, planner behavior. Sandbox-green ≠ done —
  treat every "win" above as a structural candidate until profiled.
