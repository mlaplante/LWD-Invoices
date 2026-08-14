# Performance Audit — 2026-08-13

Scope: what's *missed* or *redundant* after the #113 / #115 perf work, on branch `optimizations`
(HEAD `7e3dd5a`).

**Method and its limits.** This is a source audit. The `chrome-devtools` MCP server isn't
configured in this environment, so there are no LCP/INP/TBT/CLS numbers here. There is no `.env`
in the working tree, so `next dev` (which has `log: ["query","error","warn"]` in `src/server/db.ts`)
couldn't be run to count SQL statements per page render. **No millisecond or KB figures in this
document are measured** — findings are ranked by *mechanism certainty* instead, and each one names
the check that would confirm it. `npm run analyze` exists for bundle numbers but forces `--webpack`
while production builds with Turbopack, so its figures are indicative, not the shipped bundle.

---

## Status

| # | Finding | Status |
|---|---|---|
| 1 | Index drift (51 undeclared) | **Fixed** — 40 declared, 11 partial documented; drift 51 → 11 |
| 2 | Prisma pool `max: 1` serializes `Promise.all` | **Partially done.** `resolveMembership` collapsed to one query (shipped, tested). The `max` change itself is **blocked** on confirming the production `DATABASE_URL` — see Sizing. |
| 3 | `@dnd-kit/*` in `optimizePackageImports` | **Fixed** — entries removed, comment added |
| 4–8 | — | Open |
| 9 | Two redundant duplicate indexes (new, found while fixing #1) | Open |

---

## Tier 1 — structural, high certainty

### 1. 51 indexes exist only as raw SQL in migrations, invisible to `schema.prisma`

> **FIXED** in this branch. 40 non-partial indexes are now declared with `@@index` across 18
> models; all 40 use Prisma's default naming, so the declarations resolve to the index names that
> already exist in the database — no drop-and-recreate. The 11 partial indexes cannot be expressed
> in the Prisma DSL and are now documented in a header block at the top of `schema.prisma`, with an
> explicit instruction to strip their `DROP INDEX` lines from any generated migration.
> `npx prisma validate` passes. Remaining drift: 11, all partial, all documented.

**Verified.** Parsing all 78 migrations and `schema.prisma`: 159 live `CREATE INDEX` statements,
of which **51 across 19 tables** are not declared with `@@index`/`@@unique` in the schema.

The list includes the indexes that back the hottest queries in the app:

| Table | Undeclared indexes |
|---|---|
| `Invoice` | `(organizationId, date)`, `(organizationId, isArchived, status)`, `(organizationId, clientId)`, `(organizationId, lastViewed)`, `(clientId)`, `(currencyId)`, +2 partial |
| `TimeEntry` | `(organizationId, date)`, `(organizationId, userId, date)`, `(projectId)`, `(taskId)`, +2 partial |
| `Expense` | `(organizationId, dueDate)`, `(organizationId, paidAt)`, `(projectId)`, `(categoryId)`, `(supplierId)`, `(taxId)`, +1 partial |
| `AuditLog` | `(organizationId, createdAt DESC)`, `(organizationId, entityType, entityId)` |
| `ProjectTask` | `(projectId)`, `(milestoneId)`, `(parentId)`, `(taskStatusId)`, +2 partial |
| `Client` | `(organizationId, isArchived)`, +1 partial |
| `Project`, `Milestone`, `Timer`, `Tax`, `Item`, `Ticket`, `Notification`, `Attachment`, `Comment`, `InvoiceLine`, `PartialPayment`, `CreditNoteApplication`, `HoursRetainerPeriod` | remainder |

`Invoice_organizationId_date_idx` is what makes the default invoice list
(`where { organizationId, isArchived: false } orderBy date desc`, `src/server/routers/invoices.ts`
`list`) an index scan instead of a filter-then-sort.

**Why this is a defect and not just untidy.** Prisma's schema is declarative: it diffs the *schema*
against the database and emits DDL to make the database match. Anything present in the database but
absent from the schema is a candidate for `DROP INDEX`.

**`prisma db push` is the sharp edge.** It is wired into `package.json` as `db:push`. It does no
shadow replay and writes no migration file — it diffs `schema.prisma` straight against the target
database and applies the result immediately. Run against a database that has these 51 indexes, it
drops them, with no artifact to review and nothing in git to notice.

`prisma migrate dev` (the normal way to author the next migration) is the second exposure, and the
prediction there is *unverified* — it needs a shadow database this audit didn't have. Two outcomes
are possible: Prisma replays the migration folder into a shadow DB, so the raw statements are
present there, and the schema-vs-shadow diff should propose dropping all 51 into the generated
migration; **or** a raw statement fails on a clean shadow DB, in which case `migrate dev` errors out
loudly instead — a much safer failure. 41 of the 51 are written as `CREATE INDEX IF NOT EXISTS`,
which makes a clean replay likely, but confirm before relying on this.

Production builds run `prisma migrate deploy`, which is safe. The risk is a generated migration
getting committed and then deployed.

**Fix.** Declare all 51 in `schema.prisma`. Partial indexes (`WHERE ... IS NOT NULL`) have no Prisma
DSL equivalent — keep those as raw SQL but leave a comment block in the schema next to the model so
they're visible to anyone reading it, and accept that Prisma will keep proposing to drop them.

**Confirm with:** `npx prisma migrate dev --create-only` against a scratch shadow DB — **run this
first**, before acting on the `migrate dev` half of the claim. Expected today: ~51 `DROP INDEX`
lines (or a loud replay error). After the fix: an empty migration. The `db:push` exposure needs no
confirmation — it diffs against the live DB by construction.

---

### 2. Production Prisma pool is `max: 1`, so every `Promise.all` of DB queries serializes

**Verified in source, mechanism inferred, unmeasured.** `src/server/db.ts`:

```ts
max: isProd ? 1 : 10,
```

Prisma's `PrismaPg` adapter checks a connection out of the node-postgres pool per query. With
`max: 1`, concurrent queries queue behind one connection. `Promise.all([q1, q2, q3])` therefore
executes q1 → q2 → q3 in production, with the same total DB time as three sequential `await`s.

This directly undercuts commit #113 ("parallelize independent reads"). There are ~20 `Promise.all`
sites across `src/server/routers/` and `src/server/services/` — `invoices.ts` (8), `reports.ts` (6),
`analytics-data.ts` (4), `dashboard.ts` (4) — plus `resolveMembership()` in
`src/server/user-context.ts`, which is on *every authenticated request*. In dev (`max: 10`) they
parallelize, so this is invisible locally.

The `max: 1` comment reasons about "exhausting Supabase's connection limit", and the same comment
*instructs the operator* to "use the transaction pooler URL (port 6543) in production" — which is
guidance in a code comment, not evidence of the deployed value. If that instruction was followed,
`max: 1` is leaving Supavisor's whole reason for existing on the table. If it wasn't, `max: 1` is
load-bearing. Establish which before touching it (see Sizing).

**Fix.** Raise to `max: 3` (or 5) and measure. Caveat to check first: with a transaction-mode pooler,
server-side prepared statements can misbehave across pooled connections — verify no
`PREPARE`-related errors under load before shipping.

#### Sizing

The edit is one line. The *rollout* is the work, and the risk is asymmetric.

**Gating question, must be answered first:** is the production `DATABASE_URL` the transaction pooler
(port 6543 / Supavisor) or a direct connection (5432)?

**Run `netlify env:list` and check whether `DIRECT_DATABASE_URL` is set.** This is discriminating,
and it's one command. `prisma.config.ts` notes that transaction-pooler URLs cannot run DDL, and
`netlify.toml` runs `prisma migrate deploy` during every build. So:

- `DIRECT_DATABASE_URL` **is set** → migrations use it, and runtime `DATABASE_URL` is free to be
  6543. Raising `max` is plausible; confirm the port on the value itself.
- `DIRECT_DATABASE_URL` **is not set** → `prisma.config.ts` falls back to `DATABASE_URL` for
  migrations, so `DATABASE_URL` *must* be DDL-capable, i.e. **not** 6543 — it's a direct or
  session-pooler connection. **This is the dangerous branch: do not raise `max`.**

- **6543 / Supavisor** → raising `max` is cheap and safe; that pooler exists to multiplex.
- **5432 direct** → **do not raise it.** Connections become `instances × max` against a hard
  Postgres limit (~60 on smaller Supabase plans). Exhausting it is a full outage, not a slowdown.

**Second-order effect worth planning for:** `idleTimeoutMillis: 0` disables idle reaping, so today
each warm instance holds exactly one connection forever. `max: 3` means each warm instance can hold
*three* forever — this raises steady-state connection count, not just burst. node-postgres applies
`idleTimeoutMillis` pool-wide, so you cannot keep one connection pinned and let the other two reap.
Raising `max` and keeping `idleTimeoutMillis: 0` is a deliberate pair, not two independent knobs.

**Third-order:** Supavisor in transaction mode has historically been unfriendly to server-side named
prepared statements. Whether `PrismaPg` trips this is a question for a staging soak, not for
reasoning — watch for `prepared statement "s0" already exists` under concurrency.

**Estimate:** ~10 minutes of editing, ~half a day to land safely — confirm the URL, deploy to a
preview branch, instrument, load-test, watch Supabase's connection count and error rate, then ship.

> **BLOCKED, 2026-08-13.** The gating question above could not be answered from this environment:
> the Netlify CLI is not installed, no `NETLIFY_AUTH_TOKEN` is present, and the Netlify MCP reader
> exposes project/deploy metadata but not environment variables. **The `max` value is unchanged at
> `1`.** Do not raise it until someone reads the Netlify env and confirms the port.

#### Shipped: the part that needed no infra decision

`resolveMembership()` fires two queries against `UserOrganization` for the *same* `userId` on every
authenticated request. They can be one query:

```ts
const rows = await db.userOrganization.findMany({
  where: { userId: dbUserId },
  select: { role: true, organizationId: true },
  orderBy: { createdAt: "asc" },
});
return rows.find((r) => r.organizationId === activeOrgId) ?? rows[0] ?? null;
```

Both the current `findUnique` and this `findMany` are served by the existing
`@@unique([userId, organizationId])` index, which leads on `userId`, so neither is a scan.

Be precise about the win: the old code only issued two queries when the `activeOrgId` cookie was
present — the no-cookie path was already a single query (`Promise.resolve(null)` for the other
branch). So this saves one round trip **on the cookie path only**, trading two indexed point-lookups
for one indexed range read plus a JS `.find()` over a handful of rows. Not a universal halving, but
it is on the path of every authenticated request and carries no infra risk.

**Shipped as `ef3bf69`.** The selection rule is now an exported pure function, `pickMembership()`,
covered by `src/test/user-context-membership.test.ts` (7 cases). The security-relevant one is
pinned explicitly: a cookie naming an org the user has no membership row for is *ignored*, falling
back to the earliest membership — it can never widen access. That behaviour was previously implicit
in `findUnique` returning `null`, and untested.

**Confirm with:** `resolveMembership()` in `src/server/user-context.ts` is the ideal measurement
target — a two-query `Promise.all` that runs on *every authenticated request*, so it's both the
cheapest thing to instrument and the clearest demonstration that the mechanism is real. Log the two
query durations and the wall time of the `Promise.all`. If serialized, wall ≈ sum; if parallel,
wall ≈ max. Re-measure after raising `max`.

---

### 3. `@dnd-kit/*` in `optimizePackageImports` is a known-unsafe entry

> **FIXED** in this branch. The three entries are removed and replaced with a comment naming both
> `@dnd-kit/*` and `@tanstack/react-query` as permanently unsafe here, with the reason. Still needs
> a manual check: stop dev, `rm -rf .next`, restart, drag a line item in the invoice canvas.

**Verified.** `next.config.ts` lists:

```ts
"@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities",
```

These packages coordinate via module-load singletons; aggressive modular-import rewriting can
produce multiple instances, so `DndContext` and `useDraggable` land in different contexts — the UI
mounts but never wires up drag. This repo uses dnd-kit in three components, including the
newly-built invoice canvas:

- `src/components/invoices/canvas/CanvasLineRows.tsx`
- `src/components/invoices/LineItemEditor.tsx`
- `src/components/dashboard/LayoutEditorDialog.tsx`

This is a correctness hazard first and a perf item second. `@tanstack/react-query` — the other
package with this failure mode, and the one that would break every tRPC hook — is correctly *not*
in the list.

**Fix.** Remove the three `@dnd-kit/*` entries. Then stop the dev server (HMR does not pick up
`next.config.ts`), `rm -rf .next`, restart, and drag a line item in the invoice canvas.

---

## Tier 2 — request path

### 4. ~24 dashboard pages are `"use client"` with no server prefetch

The pattern that fixes this is **already built and working** in this repo — `src/trpc/server.ts`
exports `HydrateClient`, and six pages use it correctly (`expenses`, `money-intelligence`,
`mileage`, `contractors`, `contractors/[id]`, `timesheets`):

```tsx
void api.expenses.list.prefetch({});
return <HydrateClient><ExpensesClient /></HydrateClient>;
```

Everywhere else, a `"use client"` `page.tsx` ships HTML with no data, hydrates, then issues an HTTP
round trip before the server even starts the query. Verified examples:

| Page | Query fired on mount |
|---|---|
| `(dashboard)/reports/collections/page.tsx` | `analytics.collectionsRisk` — a full org-wide invoice scan |
| `(dashboard)/invoices/unpaid/page.tsx` | `invoices.openForReminder` |
| `(dashboard)/activity/page.tsx` | `auditLog.list` |

plus `reports/{1099,cash-flow-forecast,client-health,expense-anomalies,recurring-revenue,year-end}`,
`settings/{automations,automation-rules,reminders,reports}`, and
`clients/[id]/retainers/[retainerId]`.

`reports/collections` is the worst of these: the round trip is spent waiting on the most expensive
analytics query in the app.

**Fix.** Convert each to a thin RSC shell that `void api.x.prefetch(...)` + `<HydrateClient>`, with
the interactive part extracted to a child client component. No change to the client component's
`useQuery` call — it reads the hydrated cache instead of fetching.

**Note on `loading.tsx`:** 59 of 106 route dirs lack one, but for a `"use client"` page with no
server await, `loading.tsx` never displays — the shell renders instantly. That gap is a *follow-on*
to this fix, not an independent finding. Add `loading.tsx` to the routes as they're converted.

### 5. `httpBatchLink` → `httpBatchStreamLink`

`src/trpc/client.tsx` uses `httpBatchLink`. Batched requests resolve as one unit: the whole batch
waits for the slowest procedure in it. `money-intelligence` fires seven procedures;
`invoices/[id]` fires a long tail of panel queries. `httpBatchStreamLink` is a drop-in swap that
streams each response as it resolves, so fast panels paint without waiting on slow ones.

### 6. `search` router has a client-side `staleTime` implying a server cache that doesn't exist

`src/trpc/query-client.ts` sets a 60s `staleTime` for `["dashboard", "reports", "search", "analytics"]`,
with the comment "Routers whose backend caches at ~60s". Actual `unstable_cache` coverage:

| Router | Procedures | Wrapped in `unstable_cache` |
|---|---|---|
| `dashboard` | 13 | 14 ✅ |
| `analytics` | 15 | 8 |
| `reports` | 25 | **3** |
| `search` | 2 | **0** |

`search` has no server cache at all, and `reports` has it on 3 of 25. Either add the server caching
the comment claims, or correct the comment — right now it documents a guarantee that isn't there.
`reports` is the more useful target: it's the second-largest router and the least cached.

---

## Tier 3 — targeted

### 7. Models with no usable org-leading index anywhere

Fifteen `organizationId`-scoped models have no index leading on `organizationId` in either the
schema or the migrations. Most are small config tables where a seq scan is fine. The ones worth
adding, by query-site count:

| Model | `db.*` call sites | Note |
|---|---|---|
| `ProjectTask` | 10 | Has only a **partial** org index (`WHERE assignedUserId IS NOT NULL`) — unusable for a plain org-scoped task list. Grows with usage. |
| `ProposalTemplate` | 12 | |
| `ProposalContent` | 8 | Only `(invoiceId)` |
| `Comment` | 6 | Only `(invoiceId)` |
| `RecurringInvoice` | 6 | Only `(invoiceId)` |
| `LateFeeEntry` | 4 | Grows with invoice volume |

`ExpenseCategory`, `ExpenseSupplier`, `TaskStatus` also appear but are served from
`src/server/cached.ts` at 1-hour TTL, so they're low value.

### 9. Two redundant duplicate indexes

Found while fixing #1. Two models declare an `@@index` on exactly the columns already covered by a
unique constraint. A Postgres btree unique index serves every lookup and range scan a plain index
would, so the second index is pure overhead — extra pages to maintain on every insert and update,
for zero read benefit.

| Model | Redundant | Already covered by |
|---|---|---|
| `ClientPortalSession` | `@@index([token])` | `token String @unique` |
| `PeriodClose` | `@@index([organizationId, periodYear, periodMonth])` | `@@unique([organizationId, periodYear, periodMonth])` |

`ClientPortalSession` is the one that matters — it's written on every portal login.

**Not fixed here** because, unlike #1, removing these produces a migration that genuinely drops
database objects. Worth doing, but as its own reviewed change.

### 8. Font weights

`src/app/layout.tsx` loads Poppins at 5 weights (300/400/500/600/700) and Roboto Mono at 3
(400/500/700) — 8 self-hosted woff2 files. `display: "swap"` and `next/font` self-hosting are both
correct. Whether all 8 are used is worth a check against the design system before trimming; the
comments assert each weight has a job, so verify before cutting.

---

## Verified as already correct — do not "fix" these

- **Per-request dedup is complete.** `createClient`, `getUser` (`src/lib/supabase/server.ts`),
  `findDbUserBySupabaseId`, `resolveMembership` (`src/server/user-context.ts`) are all React
  `cache()`-wrapped. The layout's four `getUser()` call sites collapse to one.
- **`src/server/db.ts`** — module-load `SELECT 1` pre-warm, `keepAlive: true`,
  `idleTimeoutMillis: 0` in prod. All correct (see finding 2 for the one exception).
- **Recharts is lazy-loaded** via `next/dynamic` in `(dashboard)/page.tsx`, and is only imported by
  three components.
- **`summaryInvoiceInclude`** is genuinely minimal for the list view; `detailInvoiceInclude` and
  `fullInvoiceInclude` are correctly separated by use case.
- **`getCollectionRiskData`** already dedupes `collectionsRisk` + `paymentProbability` into one scan.
- **Dashboard streams per widget** — each section is its own async component behind its own
  `Suspense`.
- **Service worker** correctly refuses to cache `/api/` and `/auth/`, and caches only hashed
  `/_next/static/` assets.
- **`preconnect` + `dns-prefetch` to Supabase** are present in the root layout.
- **`invoices.list` uses `$transaction([findMany, count])`** rather than `Promise.all` — with
  `max: 1` this is the better shape (one round trip), so leave it even after fixing finding 2.
- **The dashboard's 60s cache with no mutation invalidation is a documented deliberate tradeoff**
  (`src/server/routers/dashboard.ts`), not a defect.

## Out of scope

A1–A6 in the `lwd-architecture-contract` skill (`invoices.ts` size, `reports.ts` size, the
`as unknown as PrismaClient` casts, webhook dedup) are tracked roadmap items with their own sizing.
Finding 6 touches `reports.ts` and finding 1 touches the schema, but neither should be bundled with
those refactors.

## Suggested order

1. **Finding 3** (dnd-kit) — one-line config change, correctness risk, ship today.
2. **Finding 1** (index drift) — schema-only change, no runtime risk, removes a live footgun.
3. **Finding 2** (pool `max`) — one-line change, needs a staging measurement before and after.
4. **Finding 4** (prefetch conversion) — biggest user-visible win, but ~24 pages of mechanical work;
   start with `reports/collections`, `invoices/unpaid`, `activity`.
5. Findings 5–8 as capacity allows.
