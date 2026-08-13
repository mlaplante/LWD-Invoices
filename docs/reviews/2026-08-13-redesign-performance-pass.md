# Redesign Performance Pass — 2026-08-13

**Date:** 2026-08-13
**Status:** Complete (structural pass; see verification ceiling)
**Scope:** Performance review of the La Plante redesign (PR #114, `6ed7578`,
237 files) against its parent `574db5e`, looking for regressions the visual
rebuild may have introduced. Follow-up to
`2026-08-11-performance-optimizations.md` and
`2026-06-24-performance-tuning-pass.md`.

**Verification ceiling:** This pass was done in a sandbox with **no database**,
so nothing here is profiled against real data. Every finding is reasoned from
query shape and verified with the instruments that run without a DB: `npx tsc
--noEmit` (clean), `npm run test:run` (2269/2269 green), and full
`next build --webpack` bundles of both the redesign commit and its parent for
a before/after route-size comparison. Query-count arithmetic is from the code,
not a profiler. Treat the fix below as a structural win until it's confirmed
with real-data profiling / `EXPLAIN ANALYZE`.

## What the redesign actually changed, perf-wise

The diff is 237 files, but almost all of it is presentation: token/palette
sweep, primitives (`button.tsx`, `card.tsx`, `badge.tsx`, new `table.tsx` /
`stat-card.tsx`), the 7-hub nav, and per-page markup. Exactly **one server
file** changed (`src/server/routers/analytics.ts`, +20 lines), and exactly
**three new server-side data dependencies** were introduced:

1. `SmartCollectionsStrip` (new) → `api.collections.queue({ limit: 50 })`,
   rendered under the invoice table on **every invoices-list view**
   (`src/app/(dashboard)/invoices/page.tsx:233`).
2. `AiAgentCards` (new) → the same `api.collections.queue({ limit: 50 })`,
   rendered on **every AI-hub view** (`src/app/(dashboard)/assistant/page.tsx`).
3. Clients list → `api.analytics.clientHealth()`
   (`src/app/(dashboard)/clients/page.tsx:58`), added to the page's
   `Promise.all`.

Plus one new page (`/settings/connections` — a single `gatewaySettings.list()`
query) and a font swap in `src/app/layout.tsx`.

## Finding A (fixed in this pass): `collections.queue` became a hot path while staying an uncached whole-org scan

Before the redesign, `collections.queue` ran only when someone opened
`/collections`. After it, the same procedure runs on the invoices list — the
most-visited page in the app — and on the AI hub. Every call did, per view:

- 1 org-settings lookup;
- 1 scan of up to 200 open invoices with four child collections loaded per
  row — including **every `EmailEvent` row** for each invoice
  (`select: { type: true }` with no filter), though the score only reads
  whether an `email.opened` / `email.clicked` exists. Delivery/bounce events
  are the bulk of that table, so most fetched rows were dead weight;
- 1 unbounded scan of **all PAID invoices** for every client in the queue
  (`getClientPaymentBehaviorSummaries`, batched into one query by the
  2026-06-24 pass, but still proportional to org history).

None of it was cached, so three surfaces now repeated the full scan on every
render. The fix, in `src/server/routers/collections.ts`:

1. **Per-org cache with the codebase's own passive-TTL convention.** The
   ranked queue computation moved into `getRankedCollectionsQueue(db, orgId)`
   wrapped in `unstable_cache` — keyed `["collections:queue", orgId]`, tagged
   `orgTag(orgId, "collections")`, `revalidate: 60`. This mirrors the
   analytics router's documented strategy ("whole-org analytics scans whose
   cost grows with history, and 60s staleness is fine",
   `src/server/routers/analytics.ts:41`). The payload
   (`CollectionRiskScore[]`) is JSON-safe, which `unstable_cache` requires.
   Callers slice to their own `limit`, so all three surfaces share one cache
   entry per org.
2. **Explicit invalidation on the one mutation that changes the ranking's
   inputs directly**: `sendReminder` now calls
   `invalidateOrg(ctx.orgId, "collections")` after recording the reminder, so
   `remindersSent` / `daysSinceLastReminder` / `actionDue` are fresh on the
   next read. (Freshness is strictly no worse than before: the collections UI
   never refetched the queue after a send anyway —
   `src/components/collections/CollectionsQueue.tsx` has no queue
   invalidation in `sendReminder.onSuccess`.) Invoice/payment mutations rely
   on the 60s TTL, same as every analytics procedure.
3. **Narrowed the `emailEvents` load** to
   `where: { type: { in: ["email.opened", "email.clicked"] } }` — the only two
   types the score reads (`collections.ts` scoring block). Behavior-preserving
   by construction; the router test now asserts the narrowed select.

Net effect (arithmetic, not measured): the invoices list and AI hub go from
3 org-wide queries per view to ~0 amortized (one recompute per org per
60s across all three surfaces), and the cold-path scan itself fetches only
open/click events instead of the full event history.

## Finding B (no change needed): clients-list `clientHealth` dependency is correctly designed

The redesigned clients list consumes `analytics.clientHealth`, which was
extended (+20 lines, the redesign's only server change) to also return the
open-AR and 180-day revenue figures it already computed — explicitly so the
list would **not** need a second aggregate query. The procedure was already
`unstable_cache`d per-org (60s TTL, `analytics` tag), and the page calls it
inside the same `Promise.all` as the client rows. Verdict: this is the right
shape; the only cost is the cold-path recompute once per org per TTL window,
which predates the redesign. No change.

## Finding C (noted, not changed): font payload grew modestly

`src/app/layout.tsx` swapped Jakarta Sans (3 weights) + Geist Mono +
Instrument Serif for Poppins (5 weights) + Roboto Mono (3 weights). All are
`next/font` self-hosted with `display: swap`, so nothing render-blocks.
Measured from the builds (table below): the per-page **preloaded** font
payload grew from ~65 KB (3 files) to ~72 KB (6 files) — about +7 KB on
first visit, cached thereafter. Not worth trimming: the 300 weight is the
display face and the mono weights carry the eyebrow/meta system, so each
weight is actually used.

## Preserved good patterns (verified against source, not assumed)

- Both new `collections.queue` consumers render inside `<Suspense>` — they
  stream in and never block the invoice table or the chat column.
  `SmartCollectionsStrip` returns `null` for viewers (role-gated) and when
  nothing is actionable, and its try/catch means a queue failure can't take
  down the invoices page.
- The dashboard kept its per-widget Suspense sections and the lazy-loaded
  Recharts bundles (`dynamic()` imports in `src/app/(dashboard)/page.tsx`) —
  the redesign only touched class names there, and deleted a genuinely dead
  duplicated component (`WeeklyBriefingWidget`).
- The new nav derives hub expansion from `usePathname()` with no state, no
  new dependencies, and ~13 rendered rows max.
- `globals.css` keeps a `prefers-reduced-motion` kill switch; transitions are
  scoped to colors/transforms on interactive elements, not layout properties.
- The palette sweep (~640 class replacements) is pure CSS with no runtime
  cost.

## Bundle comparison (webpack build, placeholder env — measured)

Both the parent commit `574db5e` and the current branch were built with
`next build --webpack` under CI's placeholder env, same machine, same
dependency tree. All pages compile on both. Aggregates over `.next/static`
(gzip computed with zlib defaults):

| Asset class | Before (574db5e) | After (redesign) | Δ gzip |
|---|---|---|---|
| JS chunks | 287 files, 1421 KB gz | 290 files, 1427 KB gz | **+6 KB (+0.4%)** |
| CSS | 2 files, 22 KB gz | 2 files, 22 KB gz | **−1 KB** |
| Font files on disk | 12 files, 149 KB | 21 files, 389 KB | +240 KB (see below) |
| Fonts **preloaded per page** (`.p.woff2`) | 3 files, ~65 KB | 6 files, ~72 KB | **+7 KB** |

The scary-looking +240 KB of font bytes is almost entirely non-preloaded
`unicode-range` fallback subsets that a browser only fetches if a page
actually renders glyphs outside latin; the per-first-visit cost is the
preloaded set, which grew ~7 KB. JS and CSS are flat — the redesign's 237
files were, as intended, a re-skin rather than a payload change.

These are webpack-builder numbers (`--webpack`, same as `npm run analyze`
forces); production deploys use the Turbopack path, so treat absolute values
as directional and the before/after **delta** as the reliable signal.

## Candidates for a measured pass (need a real database)

- **`EXPLAIN ANALYZE` the queue scan** against real data to confirm the
  narrowed `emailEvents` join helps and that `prisma/perf-indexes.sql`'s
  invoice indexes cover the `(organizationId, isArchived, status)` shape this
  query filters on; `node scripts/check-perf-indexes.mjs` first.
- **`getClientPaymentBehaviorSummaries` bounded window** — it scans every
  PAID invoice per client forever. A 365-day cutoff (or SQL aggregation)
  would bound it, but that changes score inputs, so it needs the eval suite
  plus real-data comparison before shipping.
- **`take: 200` with no `orderBy`** in the queue scan (pre-existing): which
  200 invoices you get in a >200-open-invoice org is planner-dependent. An
  `orderBy: { dueDate: "asc" }` would make it deterministic; deferred because
  it changes which invoices appear for large orgs and deserves its own
  review.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:run` — 2269/2269 across 205 files (one new test asserting the
  narrowed email-event select; the cache wrapper is a passthrough under the
  test setup's `next/cache` mock, so all existing queue behavior is exercised
  unchanged).
- `next build --webpack` — compiles all pages on both commits; asset
  aggregates in the bundle table above are measured from the two `.next`
  outputs.
- **Not verified:** runtime behavior against a real Postgres/Supabase stack,
  actual latency deltas, planner behavior, or `unstable_cache` hit rates in
  the deployed Netlify runtime. Sandbox-green ≠ done.
