---
name: lwd-architecture-contract
description: Use when you need the load-bearing "why is it shaped this way" map for LWD Invoices before changing a router, service, or auth context — deciding where new code belongs in the app→router→service→db layering, touching src/server/trpc.ts/user-context.ts/cached.ts, adding a new tRPC router or protectedProcedure, reasoning about org-scoping/multi-tenancy correctness, evaluating whether an "as unknown as PrismaClient" cast or a >900-line router is safe to extend vs. must be split, or explaining a known architectural weak point (no cross-org tests, inline organizationId filters, webhook idempotency) instead of treating it as news.
---

# LWD Invoices — Architecture Contract

## Overview

One sentence: every request is **app → tRPC router → service → Prisma → Supabase Postgres**,
every layer trusts `ctx.orgId` and nothing else, and the two biggest open risks are that
org-scoping is enforced by *convention* (an inline `where` clause) rather than by a type system
that makes forgetting it impossible, and that nothing automatically tests for the leak.

This skill is the map of *why* the system is shaped this way and *where it is still fragile*.
It does not teach you how to fix a specific bug, run a migration, or write the eval suite —
those have their own homes (see below).

## When to use this / when NOT to use this

Use this skill when you are about to:
- Add a new tRPC router, procedure, or service and need to know where it plugs in and what it must inherit.
- Touch `src/server/trpc.ts`, `src/server/user-context.ts`, or `src/server/cached.ts`.
- Judge whether a change is "safe" from a multi-tenancy standpoint.
- Explain to someone (human or model) *why* `invoices.ts` is huge, why some routers use `getForOrg()` and most don't, or why there's an `as unknown as PrismaClient` cast in four files.

Use a sibling skill instead when the task is actually about:
- **Making** an org-scoping fix, a router split, or any other code change end-to-end → `lwd-change-control` (process/checklist for changes) or the router/service files directly.
- **Debugging** a live incident or reproducing a bug → `lwd-debugging-playbook`.
- **A specific historical incident** (the `reopen` org-filter leak, past outages) in full narrative form → `lwd-failure-archaeology`.
- **Invoice/payment/tax domain rules** (partial payments, retainers, 1099s, DSO) → `invoicing-domain-reference`.
- **Feature flags, env vars, config toggles** → `lwd-config-and-flags`.
- **Build, deploy, `netlify.toml`, migrations** → `lwd-build-and-env`.
- **Running the app locally / operating it in prod** → `lwd-run-and-operate`.
- **Test/QA strategy, the cross-org test gap as a QA backlog item** → `lwd-validation-and-qa`.
- **Encryption-at-rest, secrets, gateway credential handling** → `lwd-security-and-secrets`.
- **AI eval harness mechanics** → the AI-eval-owning skill (not this one) — this skill only says AI output must be narration, never arithmetic (non-negotiable #3/#4).

## The request path (ground truth)

```
src/app/**                          React Server/Client components (App Router, Turbopack)
  → src/server/routers/*.ts         tRPC routers, one per domain, merged in _app.ts
    → src/server/services/*.ts      business logic, PDF templates, AI-eval fixtures
      → src/server/db.ts            single Prisma Client (adapter-pg), module-level singleton
        → Supabase Postgres
```

Verified shape (2026-07-05):
- `src/server/routers/_app.ts` merges **58** routers into `appRouter` (58 `...Router` imports; the
  `routers/` directory has 61 `.ts` files total — the extra 3 are helper modules like
  `proposal-templates-helpers.ts` / `proposals-helpers.ts` that routers import, not routers themselves).
- `prisma/schema.prisma` has **75** `model` declarations.
- `src/server/services/` has **98** top-level `.ts` files plus two subdirectories
  (`ai-eval/`, `pdf-templates/`).
- `src/server/db.ts` exports one `PrismaClient` (via `@prisma/adapter-pg`'s `PrismaPg`), cached on
  `globalThis` outside production so dev hot-reload doesn't leak connections. In production it pins
  `max: 1` connection per invocation (serverless — don't exhaust Supabase's pool) with
  `idleTimeoutMillis: 0` (keep the one connection warm for the life of the instance) and fires a
  fire-and-forget `SELECT 1` at module load to pre-warm the TCP/TLS handshake before the first
  real query.

## The auth/org context — the one thing every layer depends on

`src/server/trpc.ts` → `createTRPCContext()` resolves, once per request:

1. `userId` from Supabase Auth (`getUser()`).
2. `activeOrgId` from the `activeOrgId` cookie.
3. The internal `User` row via `findDbUserBySupabaseId()` (`src/server/user-context.ts`) — wrapped
   in React's `cache()` so a dashboard render that calls it a dozen times only hits the DB once.
4. Org membership via `resolveMembership()` (also `cache()`-wrapped): tries the active-org cookie
   first, falls back to the user's first `UserOrganization` row (`orderBy: createdAt asc`) if the
   cookie is stale/absent.

**`UserOrganization` is the sole source of truth for org membership.** The code comment in
`trpc.ts` is explicit about why:

> "UserOrganization is the sole source of truth for org access. The old app_metadata fallback let
> users removed from an org (membership row deleted) keep full access via stale Supabase metadata."

⚠️ **README.md's "Architecture Notes" section is stale on this exact point** — it still says
multi-tenancy uses "Supabase Auth's organization ID from user metadata." That description predates
the `UserOrganization`-only model in the code. Trust `src/server/trpc.ts`, not that paragraph, and
don't propagate the README's wording into new docs.

`protectedProcedure` (the procedure almost everything in this app is built on):
```ts
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.isActive === false) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been suspended." });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, orgId: ctx.orgId, userRole: ctx.userRole } });
});
```
Guarantee this buys every downstream router/service: **`ctx.orgId` is non-null and belongs to a
real, active membership.** `requireRole(...UserRole[])` layers on top for role gates (throws
`FORBIDDEN` if `ctx.userRole` isn't in the allow-list).

**What `protectedProcedure` does NOT buy you:** it does not scope any individual query. That's
still on you, in every single `db.<model>.findMany/findFirst/update/delete` call. This is the
central invariant of the whole system:

> Every DB read/write MUST filter by `organizationId: ctx.orgId` (or route through the
> `getForOrg()`/`assertInOrg()` helper below). A missing filter is not a style nit — it's a
> cross-tenant data leak, i.e. a security incident.

## Org-scoping: the mechanism, and why it's still a manual pattern

There are two ways org-scoping happens in this codebase today:

**1. Inline `where` clauses (the default, ~700 call sites).** Every router/service writes
`where: { id, organizationId: ctx.orgId }` (or the `organizationId` half of a compound filter) by
hand. Verified count: **704** occurrences of `organizationId:` under `src/server` — this is the
literal blast radius of "if one of these is missing or wrong, it's a leak." (AUDIT-2026-05, run in
May 2026, cited "~347"; the codebase has grown roughly 2x that count in the two months since — the
mechanism hasn't changed, just the surface area. Re-run the count yourself; see Provenance.)

**2. The `getForOrg()` / `assertInOrg()` helpers (`src/server/lib/get-for-org.ts`, 32 verified call
sites combined).** Centralizes the "fetch-scoped-to-org-or-404" pattern:
```ts
const invoice = await getForOrg(ctx.db.invoice, input.id, ctx.orgId, {
  include: detailInvoiceInclude,
  entityName: "Invoice",
});
```
`getForOrg()` is the workhorse for scoped single-row reads; routers like `clients.ts`,
`contractors.ts`, `expenseCategories.ts`, `expenseSuppliers.ts`, and `tasks.ts` use it — but that's a
*fetch* guarantee, not a foreign-id-validation guarantee.

`assertInOrg()` is the sibling for the *other* common mistake: writing
`{ clientId: input.clientId, organizationId: ctx.orgId }` on a **new** row only scopes the new row —
it never checks the referenced `clientId` actually belongs to this org. `assertInOrg()` does that
check before you trust a caller-supplied foreign id. Only `invoices.ts`, `proposals.ts`, and
`tickets.ts` use it as of this writing (6 call sites total: `invoices.ts` ×3, `proposals.ts` ×2, `tickets.ts` ×1 — see `lwd-failure-archaeology` §3) —
most routers, including the `getForOrg()` users named above, still trust caller-supplied foreign ids
via the inline-filter pattern instead of `assertInOrg()`.

**Why this matters, concretely:** a `reopen` mutation's final `update()` once omitted
`organizationId` from its `where` clause — caught in code review, documented in
`docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` (§"`reopen` final `update`
missing `organizationId` in where clause"). The bug class: `update`/`delete` calls that key only on
`id` (not `id` + `organizationId`) will happily mutate another org's row if the id is guessable or
leaked. `findFirst`/`findMany` misses are read leaks; `update`/`delete` misses are write leaks and
strictly worse.

**Known gap (still open as of 2026-07-05, verified — no file matching `*multi-tenant*`,
`*cross-org*`, or `*leakage*` exists under `src/`):** there is no automated test that creates two
orgs and asserts cross-org access is denied. AUDIT-2026-05 flagged this (item A5) as a roadmap item,
not a fixed item. Don't assume it's covered because "tests are green" — the tests that exist don't
check this dimension. Cross-reference `lwd-validation-and-qa` for the state of test coverage
generally; this skill only asserts the gap exists at the architecture level.

## Caching layer — `src/server/cached.ts`

Cross-request cache for **org-scoped, rarely-changing, non-Decimal** reads, built on Next's
`unstable_cache` + tag-based invalidation (`revalidateTag`). Added in the perf work behind commit
`c28fc9c` ("cache dashboard/analytics aggregates, dedupe per-request lookups, fix streaming gaps",
#93).

Load-bearing constraint, stated directly in the file's own comment: it is **intentionally scoped to
tables without Prisma `Decimal` columns**, because the Next.js data cache serializes through JSON,
which drops `Decimal`'s prototype methods on the way back out. The handful of helpers that *do*
cache decimal-bearing models (`getTaxesForOrg`, `getCurrenciesForOrg`, `getGatewaysForOrg`) work
around this by mapping to a plain-number shape (`.toNumber()`) before caching — never cache a raw
`Decimal` object.

Invalidation contract: every helper is `unstable_cache(..., { tags: [orgTag(orgId, resource)],
revalidate: ONE_HOUR })()`. Every code path that mutates one of these resources must call
`invalidateOrg(orgId, resource)` (which calls `revalidateTag(orgTag(...), { expire: 0 })` — Next 16
requires the `expire` option to force an immediate purge instead of waiting out a `cacheLife`
profile). If you add a new cached-and-mutable resource, wire the invalidation call at every mutation
site or you'll serve stale data for up to an hour.

Each helper takes `db: PrismaClient` as an explicit first argument rather than importing the
singleton — so tests can pass a mocked client and get the same caching behavior they'd get in
production, with no hidden dependency on the module-level `db` singleton.

## Known weak points (stated plainly — these are open, not solved)

| # | Where | What | Status |
|---|---|---|---|
| A1 | `src/server/routers/invoices.ts` | **1696 lines** (AUDIT-2026-05 measured 1188; it has grown since). Mixes CRUD, payment application, retainer logic, scheduling/reminders in one file. | Open. Proposed split (per audit): `invoices-core.ts` / `invoices-payments.ts` / `invoices-scheduling.ts`, re-merged via `mergeRouters` so the public router shape doesn't change. |
| A2 | `src/server/routers/reports.ts` | **981 lines** (audit measured 920). One file per report type would be smaller units of review. | Open. |
| A3 | `invoices.ts`, `expenses.ts`, `proposals.ts`, `timeEntries.ts` | `ctx.db as unknown as PrismaClient` casts (needed because `ctx.db` inside a `$transaction` callback is a `Prisma.TransactionClient`, not the top-level `PrismaClient`, but some shared helper functions are typed against `PrismaClient`). **Correction to prior audit note:** the cast is NOT in `hoursRetainers.ts` — verified absent there as of this writing. | Open. Fix proposed: a typed `TransactionClient` alias in `server/lib/` so the mismatch is caught at compile time instead of cast away. |
| A4 | Org-scoping mechanism | ~704 inline `organizationId:` sites vs. 32 `getForOrg`/`assertInOrg` call sites. The helper exists and works; adoption is partial. | Open, by design a slow migration (see above). |
| A5 | Test suite | No cross-org/multi-tenant leakage test exists. | Open — biggest single gap relative to non-negotiable #1. Cross-ref `lwd-validation-and-qa`. |
| A6 | `src/app/api/webhooks/{stripe,resend,inbound-email}/route.ts` | Each webhook handler owns its own verification/logging/idempotency inline; no shared `withWebhookHandler(...)` helper. Dedup for Stripe/Resend is per-process, not table-backed — a multi-instance deploy can double-process a retried webhook. | Open (AUDIT-2026-05 items S3/S4/A6). |

Do not "solve" any of these as a side effect of an unrelated task without calling it out explicitly
— they're each sized as their own piece of work in AUDIT-2026-05's roadmap section.

## One example, end to end: adding a new org-scoped router

1. New file `src/server/routers/widgets.ts`, built on `protectedProcedure` (or `requireRole(...)`
   if it needs a role gate) — never on bare `publicProcedure` for anything that touches tenant data.
2. Every procedure's Prisma call scopes by `ctx.orgId`:
   - Reads: `ctx.db.widget.findMany({ where: { organizationId: ctx.orgId } })`, or
     `getForOrg(ctx.db.widget, input.id, ctx.orgId, { entityName: "Widget" })` for a single-row
     fetch (prefer this — it's audit-friendly and gives you `NOT_FOUND` semantics for free).
   - Any caller-supplied foreign id referencing another model (e.g. `input.clientId`) goes through
     `assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" })` before you
     write it onto a new row.
   - Writes: `organizationId: ctx.orgId` on create; `where: { id, organizationId: ctx.orgId }` on
     update/delete — never `where: { id }` alone.
3. Register it in `src/server/routers/_app.ts`: import + add `widgets: widgetsRouter` to the
   `appRouter` object.
4. If it needs cross-request caching of rarely-changing org data, add a helper to
   `src/server/cached.ts` following the existing pattern (tag + `ONE_HOUR` revalidate + explicit
   `invalidateOrg()` call at every mutation site) — but only if the model has no `Decimal` columns,
   or you map to plain numbers first.
5. If it's large/risky, get a second pass with `lwd-change-control`'s process before merging.

## Common mistakes

- **Treating `protectedProcedure` as if it scopes queries.** It only guarantees `ctx.orgId` exists
  and is valid — it does not filter anything for you.
- **`where: { id }` on `update`/`delete`.** This is the exact shape of the real `reopen` bug. Always
  `where: { id, organizationId: ctx.orgId }`.
- **Trusting a caller-supplied foreign id (`clientId`, `projectId`, …) without `assertInOrg()`.**
  Scoping the *new* row you're creating does not verify the *referenced* row is in-tenant.
- **Assuming "tests pass" covers multi-tenancy.** It doesn't (A5, above) — there is no leakage test
  in the suite to catch this class of bug today.
- **Caching a model with a `Decimal` column directly through `unstable_cache`.** It'll come back
  without `.toNumber()`/arithmetic methods after JSON round-tripping. Map to a plain-number shape
  first, as `getTaxesForOrg`/`getCurrenciesForOrg`/`getGatewaysForOrg` do.
- **Quoting README.md's "Architecture Notes" section as current truth for how org resolution
  works.** It's stale on the app_metadata point; `src/server/trpc.ts` is the ground truth.
- **Silently "fixing" A1–A6 above as a drive-by inside an unrelated PR.** Flag it and route through
  `lwd-change-control` instead — these are sized, tracked roadmap items, not free-standing bugs.

## Provenance and maintenance

Date-stamped: **2026-07-05**. All numbers below were verified against the source in this repo on
that date; re-run the commands to check for drift.

Files opened and verified: `src/server/trpc.ts`, `src/server/db.ts`, `src/server/cached.ts`,
`src/server/user-context.ts`, `src/server/routers/_app.ts`, `src/server/lib/get-for-org.ts`,
`README.md` (Project Structure + Architecture Notes sections), `docs/reviews/AUDIT-2026-05.md`,
`docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`, `netlify.toml`,
`package.json`, `prisma/schema.prisma` (model count), `src/server/routers/invoices.ts`,
`src/server/routers/reports.ts`, `src/server/routers/expenses.ts`,
`src/server/routers/proposals.ts`, `src/server/routers/timeEntries.ts`,
`src/server/routers/hoursRetainers.ts` (confirmed cast absent there).

⚠️ **Measurement gotcha specific to this environment:** this repo's shell has an `rtk` (Rust Token
Killer) hook that transparently rewrites interactive commands like `grep`/`git status` for token
savings, and it **truncates long output before it reaches a pipe** — so `grep -rn ... | wc -l` run
directly at an interactive prompt can silently undercount (verified: it reported 205 for a query
where the true count was 704). Don't trust a piped count from an interactive shell command in this
repo. Either run a `.sh` script file (a real subprocess doesn't inherit the interactive `grep`
shell-function hook) or prefix the raw command with `rtk proxy` (documented in `RTK.md`: "Execute
raw command without filtering"). The script below uses the script-file route.

Re-verification commands (run from repo root):
```bash
# One-shot re-census of everything numeric in this skill:
bash .claude/skills/lwd-architecture-contract/scripts/org-scoping-census.sh

# Or individually, always via `rtk proxy` or a script file (see gotcha above), never bare interactively:
rtk proxy grep -c "^import.*Router" src/server/routers/_app.ts     # routers merged
rtk proxy grep -c "^model " prisma/schema.prisma                    # Prisma model count
rtk proxy grep -rn "organizationId:" src/server --include="*.ts" | wc -l   # inline org-scope sites
rtk proxy grep -rn "getForOrg(\|assertInOrg(" src --include="*.ts" | grep -vc "server/lib/get-for-org.ts"  # helper adoption
rtk proxy grep -rln "as unknown as PrismaClient" src/server --include="*.ts"  # cast locations
wc -l src/server/routers/invoices.ts src/server/routers/reports.ts  # oversized-router drift
grep -n "migrate deploy" netlify.toml                                 # non-negotiable #2 still true
```

Known-stale items to watch: README.md's "Architecture Notes" org-resolution paragraph (see above);
AUDIT-2026-05's absolute counts (dated May 2026 — the mechanism it describes is still accurate, the
numbers have moved with codebase growth, expect them to keep moving).
