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

## Addendum (same day): build time & compiled size — what's left

Follow-up question: can build times and compiled sizes be improved further?
Measured in the same sandbox (4 cores, Turbopack — the builder CI and
Netlify actually use, unlike the webpack `--webpack`/`analyze` path):

| Build | Wall clock | Compile step |
|---|---|---|
| Cold Turbopack build (empty `.next`) | 53s | 39.8s |
| Warm rebuild (`turbopackFileSystemCacheForBuild`, 1-file touch) | 9s | 1.5s |

**Build time: no meaningful lever remains in the app itself.** The expensive
parts of a real deploy are outside `next build`: `npm ci`, `prisma generate`,
`prisma migrate deploy`, and (Netlify only) Sentry source-map upload. The
repo already has every standard mitigation on: Turbopack FS cache persisted
in CI (`actions/cache` on `.next/cache`) and Netlify
(`NETLIFY_NEXT_CACHE_PERSIST`), npm cache in CI, type-check/lint moved out of
the build (`ignoreBuildErrors`), esbuild for Netlify functions. The one
untested lever is `widenClientFileUpload: true` in `next.config.ts` — it
widens Sentry's source-map upload to all client files, which costs upload
time on every Netlify deploy; setting it `false` trades vendor-frame
readability in stack traces for faster deploys. Unmeasurable in this sandbox
(no `SENTRY_AUTH_TOKEN`), so it stays a candidate.

**Compiled size: one dominant lever, and it's a product decision, not a
tuning knob.** Root first-load JS (`build-manifest.json` `rootMainFiles`,
loaded on every page, gzip):

| Variant | First-load JS (gz) |
|---|---|
| Current (client Sentry: errors + tracing + log forwarding) | **290 KB** |
| Sentry init kept, tracing/router-spans options removed | 290 KB — **identical** |
| Client Sentry removed entirely (server/edge Sentry untouched) | **128 KB** |

Two facts fall out:

1. **The client Sentry SDK is 162 KB gz — 56% of every page's baseline JS.**
   Nothing else comes close: the whole redesign moved first-load JS by 6 KB;
   fonts by 7 KB.
2. **Trimming Sentry's init options saves zero bytes.** The static
   `import * as Sentry from "@sentry/nextjs"` pulls the full client SDK
   regardless of which integrations are enabled, and the SDK's tree-shaking
   flag (`disableLogger`) is a documented no-op under Turbopack (see the
   note already in `next.config.ts`). The choice is all-or-nothing at the
   import level.

Options, none applied here because they change observability behavior:

- **Keep as-is** — full browser error capture, 10% traces, warn/error log
  forwarding, at 162 KB gz per first visit (cached after).
- **Drop client Sentry, keep server/edge** — first-load JS drops 56%.
  Server-side errors (tRPC, API routes, Inngest) still captured; lost are
  browser-only errors (hydration, client components) and client traces.
- **Lazy-load the client SDK after hydration/idle** — keeps telemetry,
  moves the 162 KB off the critical path (out of `rootMainFiles`, fetched
  post-interactive). Loses errors thrown before the deferred init runs —
  which includes exactly the hydration-failure class client Sentry is best
  at catching. Worth prototyping only with that caveat accepted.

Everything else checked and already optimal: `optimizePackageImports`
covers the heavy libraries; Recharts is route-scoped/lazy; `jszip` and
`@react-pdf/renderer` are server-only (the latter externalized); CSS is
22 KB gz total; immutable cache headers on hashed assets and fonts.

## Addendum 2 (same day): why Netlify builds run cold, and the fix

Report: Netlify never gets the warm-build benefit measured above. Verified
facts (from reading the pinned `@netlify/plugin-nextjs` 5.15.13 source in
`node_modules` and from controlled builds in this sandbox):

1. **`NETLIFY_NEXT_CACHE_PERSIST` was fictional.** The string appears nowhere
   in the plugin. There is no opt-in flag: the plugin unconditionally restores
   `.next/cache` in `onPreBuild` and saves it in `onBuild` (`dist/build/cache.js`),
   logging exactly `Next.js cache restored` / `No Next.js cache to restore` /
   `Next.js cache saved`. The env var has been removed from `netlify.toml`.
2. **The Turbopack cache itself is robust to per-deploy churn.** Controlled
   experiments here: a new commit SHA → warm (13s); `SENTRY_RELEASE` changed
   between builds → warm (13s). So deploy-to-deploy variation does not
   explain cold builds.
3. **The cache is keyed by Next.js version and grows without bound.**
   `.next/cache/turbopack/` holds one ~600MB directory per Next version
   (e.g. `v16.3.0-d73f5622`). A version bump starts an empty cache AND
   leaves the old directory in the persisted cache forever. This repo bumps
   dependencies roughly weekly (#108–#112 are all dep updates), so the
   persisted cache both misses (new version key) and bloats (dead versions
   accumulate), making Netlify's cache save/restore slower and pushing it
   toward eviction — a plausible mechanism for "always cold."

**Fix shipped:** `scripts/prune-turbopack-cache.mjs` runs first in the
Netlify build command (after the plugin's cache restore, before
`next build`). It deletes every turbopack cache subdirectory not matching
the installed Next version and can never fail the build (all errors are
swallowed, always exits 0). Verified locally: keeps the live version dir,
removes a planted stale one, no-ops cleanly when no cache exists.

**How to confirm on the next deploys** (this sandbox cannot see Netlify):

- In the deploy log, before the build command output, look for
  `Next.js cache restored` (plugin) — if it says
  `No Next.js cache to restore` on every build, the cache is not surviving
  between builds at all (check for "Clear cache and deploy" triggers, and
  whether the previous build logged `Next.js cache saved`).
- In the `next build` output, `✓ Compiled successfully in Xs` — warm is
  single-digit-to-low-double-digit seconds (9–14s here on 4 cores); ~40s+
  means the compile ran cold even if the cache restored, which after this
  fix should only happen on deploys that bump Next.js or the lockfile.

Expected steady state after the fix: cold compile only on dependency-update
deploys; warm (cache-hit) compile on ordinary code deploys.

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
