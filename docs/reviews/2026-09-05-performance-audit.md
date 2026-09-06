# Web Performance Audit — pancake (LaPlante Web Development Invoices)

## Status (2026-09-05)

Findings 1–10 from the ranked list were applied in commit `445b1653` on `main`. Finding 4 was corrected during remediation (queries were already GET; the fix became a `splitLink` so allowlisted batches stay pure). Not applied: the Sentry profiler gating (needs a cold-start measurement first), the LOW items, and the production pool `max` change still open from the 2026-08-13 audit. Post-fix build: home route first-load JS 328 kB → 198 kB gzip; recharts and cmdk no longer in any route's entry JS.

## Mode & inputs

**Mode: Quick (static source analysis) plus a local production build for bundle sizes.** No Lighthouse JSON, PageSpeed/CrUX response, DevTools trace, or live URL was provided, so no Core Web Vitals are claimed and every finding is labeled **potential impact**. A local `npx next build` (Turbopack, compiled in 10.9s) supplied the per-route first-load JS figures in the Bundle section below. (The original subagent pass believed `node_modules` was absent; that was wrong — the DX audit ran tsc/eslint/vitest in the same tree, and the build was run afterwards by the coordinating session.)

- Framework / stack: Next.js 16 App Router, Turbopack (default builder), React 19, tRPC 11 + `@tanstack/react-query` 5, Prisma 7 (`@prisma/adapter-pg`) on Supabase Postgres, Tailwind 4, recharts 3, `@react-pdf/renderer`, `@anthropic-ai/sdk`, deployed on Netlify via `@netlify/plugin-nextjs`.
- ~986 TS/TSX files in `src/`, 238 files carry a real `"use client"` directive (one additional match was a code comment referencing the directive historically, not an actual directive — see Findings).
- 63 tRPC routers under `src/server/routers`, merged in `src/server/routers/_app.ts`.

## Scorecard (sourced only)

| Metric | Value | Source | Target | Status |
|--------|-------|--------|--------|--------|
| LCP | not measured | — | ≤ 2.5s | — |
| INP | not measured | — | ≤ 200ms | — |
| CLS | not measured | — | ≤ 0.1 | — |
| Lighthouse Performance | not measured | — | ≥ 90 | — |

> Artifacts used: local Turbopack production build (`.next/server/app/**/page_client-reference-manifest.js` entry JS files, gzipped). No Lighthouse/CrUX data.
> Framework / stack detected: Next.js 16 App Router (Turbopack), React 19, tRPC 11 + React Query 5, Prisma 7 (adapter-pg) / Supabase Postgres, Tailwind 4, Netlify (`@netlify/plugin-nextjs`).

## Summary
- Critical: 0
- High: 3
- Medium: 8
- Low/Info: 6

## Findings

### [HIGH] Client-only "shell" pages create a fetch waterfall on at least 6 dashboard routes
- **Area:** Core Web Vitals / Loading
- **Location:**
  - `src/app/(dashboard)/disputes/page.tsx` → `src/components/disputes/DisputesList.tsx:1,48` (`"use client"`, `trpc.disputes.list.useQuery(...)`)
  - `src/app/(dashboard)/collections/page.tsx` → `src/components/collections/CollectionsQueue.tsx:1,22` (`trpc.collections.queue.useQuery(...)`)
  - `src/app/(dashboard)/reconciliation/page.tsx` → `src/components/reconciliation/UnmatchedPaymentsList.tsx:1,37` (`trpc.paymentReconciliation.list.useQuery(...)`)
  - `src/app/(dashboard)/clients/retention/page.tsx` → `src/components/retention/RetentionQueue.tsx:1,25` (`trpc.clientCheckIns.list.useQuery(...)`)
  - `src/app/(dashboard)/replies/page.tsx` → `src/components/replies/ReplyTriageList.tsx:1,28` (`trpc.replyTriage.list.useQuery(...)`)
  - `src/app/(dashboard)/month-end-close/page.tsx` → `src/components/close/MonthEndClose.tsx:1,65` (`trpc.monthEndClose.preview.useQuery(...)`)
- **Description:** Each `page.tsx` above is a bare server shell (title + description) that renders one client component. None of the six pages import `@/trpc/server`, call `.prefetch()`, or wrap children in `HydrateClient`. The primary data for the page is fetched entirely client-side via `useQuery` after hydration, so the HTML that reaches the browser has no content — it must be filled in by a second network round trip after JS parses, hydrates, and the query resolves.
- **Impact:** potential impact — this is the classic RSC-to-client waterfall (empty paint → hydrate → fetch → repaint), pushing out effective LCP/TTI for these six routes, and is a self-inflicted regression pattern the same codebase already diagnosed and fixed once. `src/app/(dashboard)/reports/collections/page.tsx:6-13` carries this exact comment: *"This page was previously `"use client"` end to end, which meant the HTML shipped with no data, the browser hydrated, and only then did it issue the request... The round trip was pure dead time in front of the slowest thing we run."* — and was rewritten to `await api.analytics.collectionsRisk.prefetch()` + `<HydrateClient>`. The six routes above are the same shape, unfixed.
- **Recommendation:** Apply the same fix used in `reports/collections/page.tsx`: make each `page.tsx` an `async` Server Component, call `void api.<router>.<procedure>.prefetch(...)` for the primary query, and wrap the client list component in `<HydrateClient>`. This is a mechanical, low-risk change since the target pattern already exists and is proven in this exact codebase (20 other routes already use it, e.g. `src/app/(dashboard)/timesheets/page.tsx`).

### [HIGH] Bulk `markPaidMany` fires up to 50 concurrent nested transactions against a single-connection production pool
- **Area:** Core Web Vitals / Network
- **Location:** `src/server/routers/invoices.ts:1185` (`invoices.map(async (invoice) => { await ctx.db.$transaction(async (tx) => {...}) })` inside `Promise.allSettled`, gated by `.input(z.object({ ids: z.array(z.string()).min(1).max(50), ... }))` at `src/server/routers/invoices.ts:~1150`) combined with `src/server/db.ts:14` (`max: isProd ? 1 : 10`).
- **Description:** `markPaidMany` accepts up to 50 invoice IDs and, for each one, opens its *own* `ctx.db.$transaction` (a `payment.create` + `invoice.update` pair) concurrently via `Promise.allSettled`. In production, the Prisma client is built with `max: 1` — a single pooled connection per warm function instance (documented at `db.ts:11-14` as a deliberate serverless/Supabase-connection-limit guard). Fifty concurrent transaction requests against a one-connection pool don't actually run concurrently: Prisma queues each transaction's connection acquisition, so the "concurrent" `Promise.allSettled` collapses into fifty serialized acquire→run→release cycles, and if that serialized total exceeds Prisma's transaction/pool-acquisition timeout, requests fail outright.
- **Impact:** potential impact — a bulk "mark 50 invoices paid" action, which is exactly the kind of action a paid user reaches for at month-end, is likely to be far slower than a naive read of `Promise.allSettled` suggests, and is a candidate for `P2024` (pool timeout) errors under the `max:1` production configuration.
- **Recommendation:** Either (a) replace the per-invoice `$transaction` with one batched write — a single `payment.createMany` for the qualifying invoices plus one `invoice.updateMany` — since all rows in this path receive the same `status: PAID` update, or (b) if per-invoice branching is required, run them sequentially (`for...of` + `await`) rather than via `Promise.allSettled`, since the pool is already serializing them; the concurrency currently buys nothing but adds queuing risk. The `sendMany` path at `invoices.ts:1078` has the same shape (N individual `ctx.db.invoice.update` calls under `Promise.allSettled`, capped at 50) — lower severity since it isn't nested in `$transaction`, but the same batching fix (`updateMany` grouped by the two possible `status` values) applies.

### [HIGH] Reports router pulls entire org history into Node and aggregates in memory instead of using SQL
- **Area:** Network / Rendering (server)
- **Location:** `src/server/routers/reports.ts:525-560` (`timeTracking`) and `src/server/routers/reports.ts:564-600+` (`utilization`); consumed by `src/app/(dashboard)/reports/time/page.tsx` which defaults to `"All Time"` (`from`/`to` both `undefined`) when no query params are present.
- **Description:** Both procedures build a Prisma `where` clause that is genuinely unbounded when `from`/`to` are absent (`"All Time"` is the default UI state), do a single `findMany` with no `take`, and then loop over every row in JavaScript (`for (const e of entries) { ... row.totalMinutes += ...}`) to compute per-project/per-user totals — work a single `groupBy`/`SUM(...)` would do in the database. This is inconsistent with the same file's own `clientProfitability`-style query at `reports.ts:333`, which already uses `ctx.db.$queryRaw` with a `GROUP BY` for an equivalent rollup.
- **Impact:** potential impact — for an organization with several years of time-tracking history, the default "All Time" view on `/reports/time` (and `/reports/utilization`) loads and holds every `TimeEntry` row (plus a `project`/`client` join) in the Node process for every request, with no caching (`reports.ts` wraps only 1 of 26 procedures in `unstable_cache`, per the documented audit in `src/trpc/query-client.ts:14-20`). This scales linearly with data volume and directly increases TTFB for the report page and memory pressure on the shared serverless function.
- **Recommendation:** Push the aggregation into SQL (`ctx.db.timeEntry.groupBy({ by: ["projectId"], _sum: { minutes: true }, where })`, or a raw query matching the style already used at `reports.ts:333`), and/or wrap the procedure in `unstable_cache` with a short TTL the way `dashboard.ts` does, so a repeat "All Time" view doesn't recompute from scratch.

### [MEDIUM] `SHORT_CACHE_QUERIES` cache-control header rarely applies — mixed batches downgrade to no-store
- **Correction (2026-09-05, during remediation):** this finding originally claimed the client never sends GET because `methodOverride: "GET"` was missing. That was wrong. `@trpc/client` 11.x resolves the method per op as `methodOverride ?? { query: "GET", mutation: "POST" }[op.type]`, so queries were already GET; `methodOverride` is typed `'POST'`-only and is a blanket override for hosts that cannot route non-POST. Verified against `node_modules/@trpc/client/dist/httpUtils-*.mjs`.
- **Area:** Loading / Network
- **Location:** `src/app/api/trpc/[trpc]/route.ts` (responseMeta requires `paths.every(p => SHORT_CACHE_QUERIES.has(p))`) vs. `src/trpc/client.tsx` (one batch link for all queries).
- **Description:** The header is only emitted when every procedure in a batch is allowlisted. A page's batch mixes reference-data queries (`currencies.list`, `taxes.list`, …) with page-specific ones, so the batch resolves to `no-store` and the browser cache is never used for the reference data.
- **Impact:** potential impact — the reference-data cache is effectively dead on real pages, subject only to React Query's staleTime.
- **Recommendation (applied):** `splitLink` in `src/trpc/client.tsx` routes allowlisted queries through their own `httpBatchStreamLink` so their batches stay pure; the allowlist moved to `src/lib/short-cache-queries.ts` and is shared by both sides.

### [MEDIUM] `CommandPalette` ships on every dashboard route without code-splitting
- **Area:** Loading / Rendering
- **Location:** `src/app/(dashboard)/layout.tsx:167-169` (`<Suspense><CommandPalette /></Suspense>`); `src/components/layout/CommandPalette.tsx:1-22` (`"use client"`, imports `cmdk`'s `Command`, `radix-ui`'s `VisuallyHidden`, and the shared `Dialog` primitive).
- **Description:** `CommandPalette` is mounted unconditionally in the root dashboard layout (present on every one of the ~79 dashboard routes) and is a `"use client"` component wrapped only in `<Suspense>`. `Suspense` around a client component in a Server Component controls *when the server waits* for async children — it does not code-split the client component's JS. Since `CommandPalette` is a static import, its module (and `cmdk` + the Dialog/`VisuallyHidden` Radix primitives it pulls in) is part of the client bundle graph shipped for every dashboard page load, even though the palette is opened only via a keyboard shortcut or the search button. (Its data fetch is correctly gated — `trpc.search.global.useQuery(..., { enabled: debouncedQuery.length >= 2 })` at `CommandPalette.tsx:82-84` — so this is a bundle-weight finding only, not an extra-request finding.)
- **Recommendation:** Wrap `CommandPalette` in `next/dynamic` with `ssr: false` and a `loading: () => null` fallback (the same pattern already used for `RevenueChart`/`InvoiceStatusChart`/`ExpensesVsRevenueChart` in `src/app/(dashboard)/page.tsx:22-31` and for `LayoutEditorDialog` in `src/components/dashboard/DashboardLayoutEditor.tsx:11-13`), so its JS is fetched only when a user actually opens it.

### [MEDIUM] Org logo is served `unoptimized` from a public, stable URL across 7+ pages
- **Area:** Loading / Assets
- **Location:** `src/lib/supabase-storage.ts:16-48` (`uploadLogo` creates the bucket with `public: true` and returns `supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl` — a stable, non-expiring URL, confirmed distinct from the app's other storage buckets, which are `public: false` and return `createSignedUrl(...)` at `supabase-storage.ts:125,191`); consumed with `unoptimized` at `src/components/settings/BrandingForm.tsx:100`, `src/components/settings/PortalBrandingForm.tsx:152`, `src/components/portal/PortalShell.tsx:62`, `src/app/(dashboard)/invoices/[id]/page.tsx:265`, `src/app/invite/[token]/InviteAcceptClient.tsx:40`, `src/app/pay/[token]/page.tsx:171`, `src/components/portal/ProposalSignatureForm.tsx:124`, `src/components/reports/ReportHeader.tsx:19` (no `unoptimized` prop, but same public URL).
- **Description:** No `images.remotePatterns` is configured in `next.config.ts`, so `next/image` cannot optimize a remote URL and every logo `<Image>` above opts out via `unoptimized` (or, in `ReportHeader.tsx`, simply renders the raw remote source, which for a non-allow-listed remote host without `unoptimized` would itself fail Next's image optimizer at request time — worth confirming this one doesn't error under `next start`). The logo is genuinely eligible for optimization: it's a public, stable, non-rotating URL (unlike receipts/attachments, which are correctly served signed and `unoptimized`).
- **Impact:** potential impact — the org's letterhead logo renders on invoices, the client portal, proposals, the invite flow, and every printed report header without AVIF/WebP conversion or responsive `sizes`, at whatever resolution the org uploaded (up to 2MB per `src/app/api/logo/route.ts:9`).
- **Recommendation:** Add the Supabase project's storage host to `images.remotePatterns` in `next.config.ts` and drop `unoptimized` from the logo `<Image>` usages (keep `unoptimized` on the MFA QR code at `MfaEnrollment.tsx:236`, which is a `data:` URI and correctly excluded from optimization). Verify `ReportHeader.tsx`'s `<Image>` (no `unoptimized`, no explicit remote-pattern allow) actually resolves in production today — if it's silently falling back or erroring, that's a correctness bug, not just a perf one.

### [MEDIUM] N+1 query in bulk payment-reconciliation apply path
- **Area:** Data fetching (server)
- **Location:** `src/server/routers/paymentReconciliation.ts:133-141` — `for (const application of input.applications) { const invoice = await tx.invoice.findFirst({ where: { id: application.invoiceId, ... }, include: {...} }); ... }`
- **Description:** Applying one unmatched payment across several invoices issues one `findFirst` per application inside a `for` loop, all within a single `$transaction`, instead of a single `findMany({ where: { id: { in: [...] } } })` up front followed by an in-memory map lookup.
- **Impact:** potential impact — scales linearly with the number of invoices a single unmatched payment is split across; each iteration is a full round trip inside an open transaction, extending the time the transaction (and its connection, see the `max:1` finding above) is held.
- **Recommendation:** Fetch all `input.applications[].invoiceId` in one `findMany` before the loop, validate all of them, then iterate the in-memory results for the `payment.create` writes (which do need to stay per-row).

### [MEDIUM] Two portal-login pages are needlessly client components for a single `useParams()` call
- **Area:** Rendering / Client-server boundary
- **Location:** `src/app/portal/portal-login/[token]/page.tsx:1-19` and `src/app/portal/dashboard-login/[clientToken]/page.tsx:1-19`.
- **Description:** Both files open with `"use client"` solely to call `useParams()` from `next/navigation`, then pass the extracted token straight through as a prop to `PortalPassphraseLoginForm` (itself a `"use client"` component). In the App Router, a `page.tsx` already receives route params as a server-side prop (`{ params }: { params: Promise<{ token: string }> }` in Next 15/16) — there is no need to import the client `useParams` hook here at all.
- **Impact:** potential impact — marking the top-level page component client-only means the entire page (not just the interactive form) is a client boundary, forecloses any future server-side work on this route (e.g., validating the token server-side before paint, or streaming), and is unnecessary given the form itself is already a separate client component that could simply receive the token as a prop from a server `page.tsx`.
- **Recommendation:** Make both `page.tsx` files plain `async` Server Components that `await params` and pass `params.token` / `params.clientToken` to `PortalPassphraseLoginForm` as a prop, dropping the `"use client"` directive and the `useParams` import.

### [MEDIUM] AI-SDK-heavy modules are statically imported into the shared `/api/trpc` router graph
- **Area:** Server / Netlify cold start
- **Location:** `src/server/routers/assistant.ts:5` (`import { runBooksAssistant } from "@/server/services/books-assistant"`) and `src/server/routers/expenses.ts:16` (`import { resolveProvider } from "../services/receipt-ocr"`), where `receipt-ocr.ts:1` does `import Anthropic from "@anthropic-ai/sdk"`. Both routers are statically imported into `src/server/routers/_app.ts`, which is the single `appRouter` served by `src/app/api/trpc/[trpc]/route.ts`.
- **Description:** Every one of the 63 routers is aggregated into one `appRouter` for a single Next.js route handler. Because `assistant.ts` and `expenses.ts` import their AI-backed services at module top level (rather than lazily inside the specific procedure, as `portal.ts` already does for its own heavy dependencies — see `portal.ts:378-380,470-471,596,609-610` using `await import(...)` for email rendering, Stripe, and encryption), the `@anthropic-ai/sdk` module graph loads on *every* cold start of the shared `/api/trpc` function, regardless of whether the incoming request is `assistant.chat` or an unrelated `clients.list`.
- **Impact:** potential impact — added cold-start weight for the highest-traffic serverless function in the app (every dashboard page's tRPC traffic funnels through this one route), for a dependency only two of ~63 routers actually need. `@react-pdf/renderer` does not have this problem — it's already isolated to dedicated `app/api/.../route.ts` handlers that are their own functions and mostly use `await import()`.
- **Recommendation:** Convert the top-level imports in `assistant.ts` and `expenses.ts` to `await import("@/server/services/books-assistant")` / `await import("../services/receipt-ocr")` inside the specific procedure bodies, matching the pattern already established in `portal.ts`.

### [MEDIUM] Sentry's native profiling addon initializes on every server cold start regardless of sampling
- **Area:** Server / Netlify cold start
- **Location:** `src/sentry.server.config.ts:5,19` (`import { nodeProfilingIntegration } from "@sentry/profiling-node"`, `integrations: [nodeProfilingIntegration(), ...]`), loaded unconditionally from `src/instrumentation.ts:9` on every Node runtime boot.
- **Description:** `profileSessionSampleRate` is 10% in production (`sentry.server.config.ts:23`), but that only gates *which sessions get profiled* — the `nodeProfilingIntegration()` itself, including loading `@sentry/profiling-node`'s native `.node` addon (correctly externalized via `serverExternalPackages` in `next.config.ts:46`, so at least it isn't bundled), runs at `Sentry.init()` time on every single cold start, not just the sampled 10%.
- **Impact:** potential impact — native addon load is not free, and this cost is paid on 100% of cold starts for a feature actually used on 10% of sessions.
- **Recommendation:** If cold-start latency on Netlify Functions is a measured concern (worth checking with the Chrome DevTools MCP / Netlify function duration logs — this is exactly the kind of thing Deep mode could confirm), consider gating `nodeProfilingIntegration()` behind an environment flag enabled only when actively investigating a performance issue, rather than always-on in production.

### [LOW] Duplicated sequential per-task creation loop (data-dependency-bound, not easily batchable)
- **Area:** Data fetching (server)
- **Location:** `src/server/routers/projects.ts:157-166` and `src/server/routers/projectTemplates.ts:140-149` — near-identical `for (const templateTask of template.tasks) { ...await tx.projectTask.create(...) }` loops.
- **Description:** Both "create project from template" code paths insert tasks one at a time inside a `$transaction` because each child task's `parentId` depends on the just-created ID of an earlier sibling in the same loop (tracked via `sortOrderToId`). This is a genuine data dependency, not an oversight — a `createMany` can't return per-row IDs to resolve it, so full batching isn't a drop-in fix.
- **Impact:** potential impact — scales with template size (likely small, tens of tasks at most), and secondarily this logic is duplicated verbatim across two files.
- **Recommendation:** If template sizes ever grow large, consider a two-pass insert (create all tasks flat first, then one `updateMany`-style pass to wire `parentId`), but this is a minor win. Higher-value fix: extract the shared loop into one helper both routers call, to remove the duplication.

### [LOW] Single raw `<img>` bypasses `next/image`
- **Area:** Assets
- **Location:** `src/components/invoices/canvas/InvoiceCanvas.tsx:104` — `<img src={org.logoUrl} alt={org.name} className="h-10 max-w-[180px] object-contain" />`.
- **Description:** The only raw `<img>` in the codebase (all 9 other logo/QR renders use `next/image`). This sits in the interactive invoice-canvas editor, where avoiding `next/image`'s wrapper may be deliberate (canvas-style live-editing surfaces sometimes need direct `<img>` behavior), but it also means no lazy-loading default and no dimension-reservation help from Next.
- **Recommendation:** If there's no canvas-specific reason for the raw tag, switch to `next/image` with explicit `width`/`height` for consistency with the rest of the codebase and to reserve layout space (this element sits inside an interactive editor, so a layout shift here is more likely to be *seen* mid-interaction than on a static page).

### [LOW/INFO] A meaningful minority of `"use client"` files show no direct interactivity in isolation
- **Area:** Client/server boundary
- **Location:** representative sample from a full-repo scan of the 237 real `"use client"` files (one of 238 grep matches was a code comment in `src/app/(dashboard)/reports/collections/page.tsx:8` quoting the phrase historically, not a live directive — see Positive Observations): `src/components/ui/{alert-dialog,label,popover,switch,avatar,dropdown-menu,sheet,tooltip,dialog,separator,tabs,select}.tsx`, `src/components/ui/markdown-preview.tsx`, `src/components/invoices/canvas/InvoiceCanvasView.tsx`, `src/components/dashboard/{InvoiceStatusChart,RevenueChart,ExpensesVsRevenueChart}.tsx`, `src/components/theme-provider.tsx`.
- **Description:** These files carry `"use client"` without calling a hook or attaching an event handler directly in their own source. On inspection, the large majority are legitimately client-bound regardless: the `ui/*` files are thin wrappers around Radix UI primitives, which manage portals/positioning/focus internally and require a client boundary even though the wrapper itself doesn't call `useState`; the three chart files need the client boundary because `recharts`' `ResponsiveContainer` measures the DOM; `theme-provider.tsx` wraps `next-themes`, which reads `localStorage` internally. None of these are misclassified, and — importantly — since all of them are already consumed exclusively from within an already-client subtree (or, for the charts, from behind `next/dynamic` in `app/(dashboard)/page.tsx`), removing the directive would not reduce the client bundle size even where it is technically redundant, because the client boundary is already established higher in the tree.
- **Impact:** potential impact — effectively none for the files inspected; flagged here only so the "which large trees are needlessly use-client" audit question has a documented, verified answer rather than an unverified guess. `MarkdownPreview` (`src/components/ui/markdown-preview.tsx`) is the one candidate that is a pure `dangerouslySetInnerHTML` renderer with no client-only dependency visible in its own file — worth a look if it's ever consumed directly from a Server Component page, in which case it could become one.
- **Recommendation:** No action needed beyond the two portal-login pages already called out above (MEDIUM), which are the actual actionable instances of this pattern — those are top-level `page.tsx` files, not descendants of an existing client tree, so removing the directive there does shrink what ships.

### [INFO] Netlify cache-control header rules for dynamic routes are declared but unverified
- **Area:** Caching
- **Location:** `netlify.toml:79-89` — `[[headers]] for = "/portal/*"` / `"/pay/*"` set `Cache-Control: private, no-store, max-age=0, must-revalidate`.
- **Description:** These are correct, well-justified intent (`/portal/*` and `/pay/*` render per-recipient financial data and must never be cached by a shared cache). However, `/portal/*` and `/pay/*` are dynamically rendered Next.js pages served through the Netlify Next.js runtime function, not static files — whether Netlify's declarative `[[headers]]` block reliably overrides or merges with headers Next.js/the plugin itself sets on a per-request SSR response can't be confirmed from source alone.
- **Recommendation:** Confirm with `curl -I` against the live deploy that `Cache-Control` on an actual `/portal/<token>` response matches this rule, since a silent mismatch here would be a data-leakage-via-cache risk as much as a perf one.

## Bundle sizes (local production build, 2026-09-05)

Turbopack build, 108 page routes. Next 16 no longer prints a per-route size table; each figure is the gzip sum of the entry JS files listed in the route's client reference manifest (`.next/server/app/**/page_client-reference-manifest.js` → `entryJSFiles`). Not a Lighthouse measurement.

| Route | First-load JS (gzip) | Raw | Note |
|---|---:|---:|---|
| `/` (dashboard home) | 328 kB | 1,102 kB | Heaviest route; 94 kB is the recharts chunk (see finding below) |
| `/invoices/[id]/edit` | 265 kB | 891 kB | InvoiceForm + dnd-kit + canvas |
| `/invoices/new` | 264 kB | 889 kB | |
| `/invoices/[id]` | 260 kB | 878 kB | |
| `/tickets/new` | 228 kB | 763 kB | |
| `/settings/payments` | 226 kB | 763 kB | Stripe client chunks |
| median dashboard route (`/settings/proposals`) | 202 kB | 677 kB | the six unprefetched pages sit at 197–209 kB |
| shared by all 85 dashboard routes | 60 kB | 198 kB | 5 chunks; the dashboard layout adds 11 more |

| Largest chunks | Gzip | Routes loading it | Contents |
|---|---:|---:|---|
| `14kg17qtu26rt.js` | 94 kB | 1 | recharts (only `/`) |
| `080qrspc_zl3a.js` | 65 kB | 94 | Sentry browser SDK + supabase-js — the largest ubiquitous chunk. `src/instrumentation-client.ts` enables only console logging + tracing; check whether client tracing is consumed before paying this on every page |
| `0n6j7xjfe0hdv.js` | 40 kB | 107 | superjson + tRPC client |
| `28-gzejy5x0hm.js` | 20 kB | 87 | cmdk + Radix (the CommandPalette chunk) |

### [MEDIUM] The dashboard's "lazy" recharts import is not deferred — 94 kB gzip loads on first paint
- **Area:** Loading / Bundle
- **Location:** `src/app/(dashboard)/page.tsx:21-33` (three `next/dynamic` calls in a Server Component); `.next/server/app/(dashboard)/page_client-reference-manifest.js` lists the recharts chunk under the page's `entryJSFiles`.
- **Description:** The comment at `page.tsx:21` says the dynamic imports "defer the ~400KB Recharts bundle". The build shows the recharts chunk as one of the 16 entry JS files for the dashboard home, which is why `/` is the heaviest route (328 kB gzip vs. a 202 kB median). `dynamic()` called from a Server Component still server-renders the client component and ships its chunk with the page. recharts' `ResponsiveContainer` measures the DOM, so the server render produces nothing useful anyway.
- **Impact:** potential impact — ~94 kB gzip on the critical path of the most-visited route, for charts that cannot render on the server.
- **Recommendation:** Move the three `dynamic()` calls into a small client wrapper component and pass `ssr: false`, keeping the Skeleton fallback. The chunk then loads after hydration.

## Positive Observations

- **Request-level dedup via React `cache()`:** `src/lib/supabase/server.ts:32` (`getUser`) and `src/server/user-context.ts:10` (`findDbUserBySupabaseId`) are both wrapped in React's `cache()`, explicitly documented as deduplicating auth/user lookups across the dashboard layout, page components, and the tRPC context — one Supabase auth call and one DB lookup per request instead of several.
- **Fonts:** `src/app/layout.tsx` uses `next/font/google` for both typefaces, trims `Poppins`/`Roboto Mono` to only the weights actually used in `globals.css` (with an explicit code comment instructing future authors to add weights back only alongside real usage), and sets `display: "swap"` on both.
- **RSC-first data fetching:** most list/detail pages (`invoices` list, `dashboard` page, `reports/time`, etc.) call the tRPC caller directly server-side (`await api.x()`/`Promise.all([...])`) and pass plain data down as props — no client waterfall at all for these routes. `src/app/(dashboard)/invoices/new/page.tsx` is a good example of `Promise.all` used correctly for independent server fetches.
- **Documented, deliberate `staleTime` tuning:** `src/trpc/query-client.ts:6-30` carries an unusually thorough audit trail explaining exactly which routers/procedures get a 1-minute `staleTime` (because they're backed by a matching `unstable_cache` TTL) versus the 5-minute default, including a record of a prior overly-broad config that was corrected.
- **Reference-data caching:** `src/server/cached.ts` wraps stable per-org lookups (`taskStatuses`, `expenseCategories`, `taxes`, `currencies`, `gateways`, branding) in `unstable_cache` with tag-based invalidation (`revalidateTag(orgTag(...))`), and `dashboard.ts` wraps its heaviest aggregate queries the same way.
- **Service worker is safe by construction:** `public/sw.js` never intercepts `/api/*` or `/auth/*`, never caches navigation HTML (network-first with an offline fallback), caches only hashed static assets and a couple of icons at install (no precache bloat), and bumps a version string to bust old caches on deploy — this avoids the classic PWA stale-HTML footgun entirely.
- **`netlify.toml` static-asset caching:** immutable, 1-year `Cache-Control` on `/_next/static/*`, `/_next/image*`, fonts, and SVGs; `sw.js` itself is correctly set to `must-revalidate` so clients pick up new service-worker versions promptly.
- **Serverless-aware Prisma setup:** `src/server/db.ts` is a genuinely well-engineered singleton — `max: 1` connection in production (documented Supabase-pool-exhaustion guard) vs. `max: 10` in dev, `idleTimeoutMillis: 0` in prod to keep the one connection warm across invocations on a warm Lambda, `keepAlive: true`, and a fire-and-forget `SELECT 1` at module load to warm the connection in parallel with cold-start work. `prisma.config.ts` correctly separates `DIRECT_DATABASE_URL` (migrations, session pooler) from `DATABASE_URL` (app runtime, transaction pooler).
- **Indexing discipline:** `prisma/schema.prisma` carries 119 `@@index` declarations, and `prisma/perf-indexes.sql` adds further indexes via `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (safe for a live table) with a companion `scripts/check-perf-indexes.mjs` that verifies each index exists *and* is valid (catching indexes left half-built by a failed `CONCURRENTLY` run) — a notably mature index-management setup for an app this size.
- **Heavy client deps are already mostly deferred:** the dashboard's `recharts` charts and the drag-and-drop layout editor are loaded via `next/dynamic` (`src/app/(dashboard)/page.tsx:22-31`, `src/components/dashboard/DashboardLayoutEditor.tsx:11-13`); `jszip` is loaded via `await import("jszip")` at the two call sites that need it (`app/api/reports/1099/route.ts:72`, `server/services/year-end-export-job.ts:64`); most PDF generation (`@react-pdf/renderer`) is isolated to dedicated route handlers, several of which (`app/api/portal/[token]/proposal-pdf/route.ts`, `app/api/invoices/[id]/proposal-pdf/route.ts`) explicitly `await import(...)` the PDF module rather than importing it statically.
- **`next.config.ts` is thoughtfully tuned, not boilerplate:** AVIF/WebP output formats with a 30-day `minimumCacheTTL`; `serverExternalPackages` correctly externalizes native/heavy server-only deps (`@react-pdf/renderer`, `svix`, `@anthropic-ai/sdk`, `@sentry/profiling-node`); `optimizePackageImports` is populated deliberately and includes an explicit, well-reasoned comment on *why* `@dnd-kit/*` and `@tanstack/react-query` are excluded (modular-import rewriting can split a provider/consumer singleton across two module instances, silently breaking drag-and-drop or hanging queries) — this is exactly the kind of tribal-knowledge trap most codebases hit blind.
- **Middleware is latency-conscious:** `src/proxy.ts` explicitly documents avoiding "1-2 extra network round-trips on every authenticated request" by reading MFA enrollment state off the already-fetched `user.factors` instead of a second Supabase call, and skips the auth check entirely for public paths before doing any Supabase work. Rate limiting (an added network hop to Upstash) is scoped only to genuinely sensitive buckets (`portal`, `pay`, `webhook`, `apiV1`, `ai`), not applied blanket to every request.
- **Images:** `next/image` is used in 9 of 10 logo/QR-code render sites (the one raw `<img>` is flagged above as Low), all with explicit `width`/`height`; the `public/` folder is lean (2.3MB total; largest file is a 1.1MB marketing logo PNG, not served on hot paths).
- **No bfcache-breaking patterns:** no `unload`/`beforeunload` listeners anywhere in `src/`.
- **`date-fns` usage never imports a locale file** (all `format`/`formatDistanceToNow` calls use the default English formatting), avoiding the classic locale-bundle-bloat trap, and `date-fns` is already in `optimizePackageImports`.
- **Route-segment resilience:** 46 `loading.tsx` files and a root `(dashboard)/error.tsx` + `(dashboard)/loading.tsx` (which cascade to all nested routes by default) plus dedicated `error.tsx` boundaries for the three heaviest detail routes (`clients/[id]`, `invoices/[id]`, `projects/[id]`) and a root `global-error.tsx`.

## Recommendations

- Keep allowlisted reference-data queries batched separately (done via `splitLink`) so the responseMeta cache header applies; the earlier `methodOverride: "GET"` recommendation was wrong, queries were already GET.
- Roll out the `reports/collections/page.tsx` prefetch pattern to the other 5-6 client-only shell pages identified above.
- Get real Lighthouse/PSI/CrUX data once a build environment is available (`node_modules` needs installing here first) — this report is entirely static analysis and cannot confirm which of the above findings actually move a Core Web Vital versus being latent risk.
- Once a build is possible, run `ANALYZE=true npx next build --webpack` to get real bundle sizes per route and confirm which client bundles (InvoiceForm + dnd-kit + canvas, CommandPalette, etc.) are actually large enough to prioritize.
- Consider `content-visibility: auto` for the longer report tables and off-screen dashboard sections — no current evidence of a rendering-cost problem, but the report pages (25 of them, several with large tables) are reasonable candidates once real data is available to check.
- No list-virtualization library is present; not currently a concern since the main list endpoints (`invoices.list`, etc.) are properly server-paginated, but worth a second look if any client-rendered list is found (via real profiling) to render large unpaginated result sets.
