# Performance Tuning Pass — 2026-06-24

**Scope:** Full-app perf review (Next.js config, tRPC/React Query transport, Prisma
query patterns across `src/server/routers` + `src/server/services`).

**Verification ceiling:** This pass was done in a sandbox with **no database** and
where `npm run build` is not runnable (the build script runs `prisma migrate
deploy` first). Every finding below is **reasoned and type-checked (`tsc` clean),
not measured.** Anything touching the DB must be profiled against real data before
it's treated as a confirmed win. The "measure first" rule applies — these are
candidates, ranked by structural risk, not proven regressions.

## Already tuned (verified against source — no action needed)

| Lever | Evidence |
|---|---|
| React Query refetch storms | `src/trpc/query-client.ts`: global `staleTime: 5min`, `gcTime: 10min`, **`refetchOnWindowFocus: false`**, `refetchOnReconnect: false`. Per-router 60s override for `dashboard`/`reports`/`search`. Adding per-query `staleTime` to the hub would be a no-op. |
| HTTP request batching | `src/trpc/client.tsx`: `httpBatchLink` — the Money-Intelligence hub's ~7 mount queries collapse into one round-trip. |
| DB indexes | `prisma/perf-indexes.sql`: org-scoped composite + partial indexes across every hot table, applied `CONCURRENTLY`. |
| Bundle | `next.config.ts`: `optimizePackageImports` (lucide, recharts, date-fns, radix, dnd-kit), Turbopack FS cache, `serverExternalPackages` for heavy server-only deps. |
| Images | AVIF/WebP formats configured. |
| Analytics bulk-loading | `src/server/services/analytics-data.ts` centralizes N+1-avoiding bulk builders (`groupBy` + in-memory maps). |

## Findings, triaged

### A. Genuine — worth fixing (verify with a profiler first)

1. **Read N+1 on the collections/dunning page** — `src/server/routers/collections.ts:202`.
   `Promise.all(clientIds.map(getClientPaymentBehaviorSummary))` fires one
   `invoice.findMany` per distinct client (`client-payment-score.ts:84`). Already
   deduped per-client, but still N queries for N clients. The same per-client
   on-time stats are computed in one bulk pass by `aggregateClientStats` in
   `analytics-data.ts` — fix is to reuse that bulk approach (one grouped query).

2. **Read N+1 over projects** — `src/server/services/project-health-data.ts:188`.
   `Promise.all(projects.map(buildProjectHealthInput))` fires 3–4 queries per
   project (`project.findFirst`, 2× `invoice.findMany`, conditional
   `emailEvent.findMany`). Scales with project count. Convert to bulk loaders in
   the `analytics-data.ts` style.

3. **Unbounded list queries on tables that grow forever** (no `take:`):
   - `timeEntries.list` (`timeEntries.ts:23`) + `timesheets` list/export
     (`timesheets.ts:22,76`) — time entries are the highest-volume table.
   - `tickets.list` (`tickets.ts:16`) — pulls full message history per ticket.
   - `retainers.burndown` (`retainers.ts:199`) + `reports.retainerLiability`
     (`reports.ts:823`) — full transaction history per retainer.
   Add a sane `take:` cap (and cursor pagination where a UI list can exceed it).

4. **Report scans without a row cap** — `reports.ts` `unpaidInvoices`(40),
   `overdueInvoices`(70), `expenseBreakdown`(117), `invoiceAging`(534),
   `timeTracking`(572), `utilization`(618). Date-bounded in normal UI use, but a
   no-filter call full-scans the org. Add a defensive `take:` / max-range guard.

### B. Real but minor / structurally necessary

- Bulk mutations that do inherent per-item work, already parallelized:
  `invoices.sendMany`(1040) / `markPaidMany`(1129), `tasks.ts`(161,192),
  `timeEntries.ts`(194,228). One thing worth a look: `notifyOrgAdmins` runs
  per-invoice inside `sendMany`/`markPaidMany`, compounding `notification.create`
  calls — could dedupe notifications across the batch.
- Serial write loops where ordering matters and batching isn't safe:
  `projects.ts:163` (hierarchical task parents depend on prior iteration),
  `credit-hold.ts:168` (per-client values), `clients.ts:417` (CSV import —
  `createMany` would speed it but loses per-row error reporting).

### C. Non-issues — org-scoped reference data, inherently small

`items`, `taxes`, `currencies`, `scheduledReports`, `reminderSequences`,
`automationRules`, `recurringExpenses`, `milestones` (per-project), `discussions`
(per-project). Unbounded in the schema sense but bounded in practice; not worth
churning.

## Implemented in this pass (verified: 2110/2110 tests pass, `tsc` clean)

1. **A.1 Collections N+1 → bulk** — `getClientPaymentBehaviorSummaries(db, clientIds)`
   added to `client-payment-score.ts` (single-client fn now delegates to it);
   `collections.ts` queue replaces the per-client `Promise.all` loop with one
   query. Divisor/on-time semantics preserved exactly.
2. **A.2 Project-health N+1 → bulk** — `buildProjectHealthInputs` now issues ~4
   queries total (projects, change orders, client invoices, email events) instead
   of 3–4 × project count; shared `assembleProjectHealthInput` keeps the scoring
   math identical to the single-project path. Invoices fetched once per client.
3. **A.3/A.4 reconsidered → cursor pagination on `tickets`** — a bare `take:`
   would silently corrupt the financial reports (they sum/bucket every row), so
   those were **not** capped. The one genuine org-wide unbounded *list* —
   `tickets.list` — was converted to cursor pagination (`{ items, nextCursor }`),
   a new `tickets.summary` count keeps the stat tiles correct, and the list view
   no longer pulls full `messages` history per ticket. Page split into an RSC
   shell + `TicketsList` client component with "Load more".

   **Not paginated, by correctness (documented, not skipped):**
   - `reports.*` (`unpaidInvoices`, `overdueInvoices`, `expenseBreakdown`,
     `invoiceAging`, `timeTracking`, `utilization`, `retainerLiability`) and
     `retainers.burndown` — these aggregate/bucket the full set; a page would
     give wrong totals. Correct path is server-side aggregation (already done)
     ± a required date window if payloads ever grow.
   - `timeEntries.list` / `timesheets` — always scoped (`projectId`) and summed
     by their UI (`TimeTab` totals minutes); completeness is required.

   ⚠️ The `tickets` "Load more" interaction is type-checked + unit-tested at the
   procedure layer but **not runtime-verified** (no DB/app in sandbox).

## Recommended order of work (when a profiler is available)

1. Add `take:` caps to A.3 / A.4 (cheap, safe, prevents worst-case full scans).
2. Bulk-load A.1 (collections N+1) — clear win, isolated change.
3. Bulk-load A.2 (project-health N+1) — bigger refactor.
4. Batch notifications in B if admin-heavy orgs show notification write pressure.

Apply DB indexes with `node scripts/apply-perf-indexes.mjs` (already covers the
hot paths above).
