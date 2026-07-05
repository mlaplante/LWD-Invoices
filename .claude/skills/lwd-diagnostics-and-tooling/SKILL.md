---
name: lwd-diagnostics-and-tooling
description: Use when you need to MEASURE something in LWD Invoices instead of eyeballing it — running or interpreting `node scripts/apply-perf-indexes.mjs` / `scripts/check-perf-indexes.mjs`, seeing "CREATE INDEX CONCURRENTLY", an INVALID index, or `pg_index.indisvalid`, deciding whether a slow query needs an index, running `npx tsc --noEmit`, `npm run test:coverage` (v8/json-summary), `npm run test:eval` (AI golden-set), `npm run analyze` (bundle report), `npx prisma migrate status`, or `npx prisma studio`, or reading/citing `docs/reviews/2026-06-24-performance-tuning-pass.md` and needing to know which of its findings are measured vs merely reasoned.
---

# LWD Invoices: Diagnostics & Tooling

## Overview

**Core principle: this repo has real instruments for turning a suspicion into a
number — use them instead of eyeballing code and guessing.** Every instrument
below answers one narrow question. None of them, alone, proves a DB/UI/perf
claim end-to-end — know what each one actually measures, and what it is silent
about, before you cite it.

The single most important interpretation rule in this skill: **existence is not
validity.** `scripts/apply-perf-indexes.mjs` can report an index as applied while
Postgres silently leaves it `INVALID` (a `CREATE INDEX CONCURRENTLY` build that
fails partway through does this by design — Postgres won't roll it back for you).
An invalid index still occupies disk, still shows up in `\d tablename`, and is
**never used by the query planner**. `scripts/check-perf-indexes.mjs` exists
specifically to close that gap by checking `pg_index.indisvalid`, not just
existence. This "the tool that creates it isn't the tool that proves it worked"
pattern is the model for how to think about every instrument here.

## When to use / when NOT to use

Use this skill when you need to pick the right measurement tool, run it
correctly, and read its output without over- or under-claiming what it proved.

Do NOT use this skill for:
- What counts as sufficient *evidence* for a PR, how to write a new test, or
  coverage-threshold policy → **lwd-validation-and-qa**.
- Turning a raw measurement into a written, defensible proof artifact (a report,
  a review doc, a "here's what I verified and how") → **lwd-proof-and-analysis-toolkit**.
- Fixing a bug you've already diagnosed, or the systematic debugging process
  itself → **lwd-debugging-playbook**.
- First-time environment setup, `npm ci`/`postinstall` failures, or what a
  no-DB sandbox `next build` does and doesn't prove → **lwd-build-and-env**
  (owns the general verification-ceiling explanation; this skill only applies
  that same ceiling to the perf/measurement instruments specifically).
- Running migrations or these perf scripts against a **live/production**
  database as an operational task, Netlify deploy mechanics, or Inngest/webhook
  behavior → **lwd-run-and-operate** (the deploy/ops pipeline around them). The
  split is one-directional: **this** skill owns how the perf-index scripts work
  and how to read their output; lwd-run-and-operate owns running them as part of
  a deploy/operational task.
- Env var meaning / AI provider selection / feature flags → **lwd-config-and-flags**.
- Org-scoping security review methodology → **lwd-architecture-contract** /
  **lwd-security-and-secrets**.
- Historical incidents and their root causes → **lwd-failure-archaeology**.

## The instrument table

| Instrument | Command | Needs a DB? | What it actually proves | What it does NOT prove |
|---|---|---|---|---|
| Type gate | `npx tsc --noEmit` | No | Code type-checks. This is CI's real type gate (`.github/workflows/ci.yml` `check` job) — `next build` does not type-check (`next.config.ts` sets `typescript.ignoreBuildErrors: true`). | Runtime correctness, query correctness, org-scoping. |
| Test suite | `npm run test:run` (single run) / `npm run test` (watch) | No | Unit/integration-level behavior against a mocked/in-memory setup (`src/test/setup.ts` fakes env vars, mocks `server-only` + `next/cache`). | Anything that needs a real Postgres connection or real HTTP calls. |
| Coverage | `npm run test:coverage` | No | v8 line/branch coverage %; emits `text` + `json-summary` + `json` reporters (`vitest.config.mts` → these three are required by `davelosert/vitest-coverage-report-action` in CI, which posts the PR coverage comment). | That covered lines are *correct* — coverage counts execution, not assertion quality. |
| AI eval | `npm run test:eval` (= `vitest run src/test/ai-eval`) | No for mocked runs; real (non-mocked) runs need live AI provider keys | Golden-set outputs still match expected behavior/fact-guards for the scenarios in `src/test/ai-eval/*` (10 files as of this writing, incl. `grounding.eval.test.ts`, `suite-gates.eval.test.ts`). | Quality on production traffic outside the golden set. See **lwd-validation-and-qa** for harness/gate design; this skill only tells you which command to run. |
| Bundle analyzer | `npm run analyze` (= `ANALYZE=true next build --webpack`) | No (runs with placeholder env like CI's build job) | Client/server/edge bundle composition — which packages/chunks are heavy. Note it forces the **webpack** builder, not the Turbopack path `next build`/`next dev` normally use, so treat sizes as directional. | Actual page-load time or runtime perf. |
| Perf-index apply | `node scripts/apply-perf-indexes.mjs` | **Yes**, real Postgres | That each `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statement in `prisma/perf-indexes.sql` ran without error (or was already present under that name). | That the resulting index is *valid* (see below) or that it's actually used by any query plan. |
| Perf-index check | `node scripts/check-perf-indexes.mjs` | **Yes**, real Postgres | Every named index in `prisma/perf-indexes.sql` both exists and has `pg_index.indisvalid = true`. | That the planner *chooses* the index for a given query — that needs `EXPLAIN ANALYZE` on the actual query, which neither script runs. |
| Migration status | `npx prisma migrate status` | Yes | Whether the DB's applied-migrations table matches `prisma/migrations/*` on disk. | Whether `schema.prisma` and the DB's live column/index shape agree if someone hand-edited either. |
| DB inspection | `npx prisma studio` | Yes | Lets you look at real rows — the only way to eyeball actual data shape/volume. | Nothing automated; it's a manual GUI, not a check you can script or gate on. |

## Perf-index scripts, in depth

**Files:** `prisma/perf-indexes.sql` (the source of truth — 30+ `CREATE INDEX
CONCURRENTLY IF NOT EXISTS` statements across `Invoice`, `Payment`, `TimeEntry`,
`Expense`, `Project`, `Client`, `Ticket`, `AuditLog`, etc., every one either
`(organizationId, …)`-led or explicitly scoped to a parent that's itself
org-scoped), `scripts/apply-perf-indexes.mjs`, `scripts/check-perf-indexes.mjs`.
Reference copies are mirrored in this skill's `scripts/` directory for offline
reading — **always run the repo-root copies**; if they ever drift, the root
copies are canonical.

### Why two scripts, and why `CONCURRENTLY`

`CREATE INDEX CONCURRENTLY` builds the index without holding a long-lived
exclusive lock on the table (safe to run against a live production DB), but
Postgres will not allow it inside a multi-statement transaction. Both scripts
therefore open one `pg.Client` connection and fire each statement individually,
not wrapped in `BEGIN`/`COMMIT`. `apply-perf-indexes.mjs` splits
`perf-indexes.sql` on `/;\s*\n/`, strips `--` comments, and runs what's left one
statement at a time — so if you add a new index, terminate the line with `;`
followed by a newline, matching the existing file's style, or the splitter
won't see it as a separate statement.

### The pooler rewrite (both scripts do this identically)

```js
function buildSessionPoolerUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return null;
  const u = new URL(base);
  if (u.hostname === "pooler.supabase.com" || u.hostname.endsWith(".pooler.supabase.com")) {
    u.port = "5432";
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("pool_timeout");
    u.searchParams.delete("connection_limit");
    return u.toString();
  }
  return base;
}
```

If `DATABASE_URL` points at a Supabase pooler host, both scripts force it to
port `5432` (session mode) and strip `pgbouncer`/`pool_timeout`/
`connection_limit` — the transaction-mode pooler (port 6543) doesn't support
`CREATE INDEX CONCURRENTLY`'s session-scoped behavior, and going straight at
Supabase's direct host over IPv6 can just hang on some networks. If
`DATABASE_URL` isn't a pooler host at all, the URL passes through unchanged;
either way the script falls back to `DIRECT_DATABASE_URL` if `DATABASE_URL` is
unset. This is the same trap **lwd-build-and-env** documents for `prisma
migrate deploy` — these scripts encode a working reference implementation of
the fix rather than just describing it.

### Run it

```bash
# 1. Apply every index in prisma/perf-indexes.sql (idempotent — safe to re-run)
node scripts/apply-perf-indexes.mjs

# 2. Verify existence AND validity
node scripts/check-perf-indexes.mjs
```

Sample `apply` output (label = the quoted index name extracted from each
statement, or the first 60 chars if no name pattern matches):

```
Connecting via: postgresql://USER:PASS@db.xxxx.pooler.supabase.com:5432/postgres
✓ "Invoice_organizationId_isArchived_status_idx" (842ms)
· "Invoice_clientId_idx" already exists
✗ "Payment_organizationId_paidAt_idx": canceling statement due to lock timeout

Done. created=1 skipped=1 failed=1
```
(Connection string credentials are redacted before printing — verified in the
script, not just assumed.)

### The INVALID-index trap — read this before trusting an "already exists" line

`perf-indexes.sql` uses `IF NOT EXISTS` on every statement. Per Postgres's own
semantics, `IF NOT EXISTS` suppresses the error **and skips the build entirely**
if any index with that name already exists — **including one left `INVALID` by
a previously failed `CONCURRENTLY` build.** That means:

- Re-running `apply-perf-indexes.mjs` will **not** repair an existing invalid
  index. It will log it as "already exists" (or, if the earlier failure didn't
  reach the client as an "already exists" error, count it under `ok`) and move
  on — either way, the invalid index survives the rerun untouched.
- The only way to find out an index is invalid is `check-perf-indexes.mjs`,
  which queries `pg_index.indisvalid` directly:

  ```sql
  SELECT c.relname AS name, i.indisvalid AS valid
  FROM pg_class c
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY($1)
  ```
- The fix the check script itself prints (`Fix: node scripts/apply-perf-indexes.mjs
  (drop any INVALID indexes first)`) requires a manual step neither script
  automates: `DROP INDEX CONCURRENTLY "Invoice_organizationId_isArchived_status_idx";`
  via `psql` (or a one-off `pg` client script) against the same pooler URL —
  `DROP INDEX CONCURRENTLY` has the identical "can't run in a transaction"
  constraint as the `CREATE` side. Only after the drop succeeds does re-running
  `apply-perf-indexes.mjs` actually rebuild it.

**Bottom line:** treat a clean `check-perf-indexes.mjs` run (`invalid=0
missing=0`) as the real "done" signal for this instrument, not a clean `apply`
run — `apply` only tells you it didn't error, not that the index is usable.

### Going one step further: does the planner actually use it?

Neither script runs `EXPLAIN ANALYZE`. Existence + validity is necessary but
not sufficient — Postgres's planner can still ignore a valid index (stale
`ANALYZE` statistics, a query shape that doesn't match the index's leading
columns, a tiny table where a sequential scan is cheaper). If you need to prove
a specific slow query now uses one of these indexes, run
`EXPLAIN (ANALYZE, BUFFERS) <query>` against the same session-pooler connection
and look for an `Index Scan`/`Index Only Scan` node naming the index — that's a
plain Postgres technique, not something either script wraps for you. Cross-ref
**lwd-proof-and-analysis-toolkit** for how to write that up as evidence.

## Reading `docs/reviews/2026-06-24-performance-tuning-pass.md` correctly

This doc is the canonical example of the verification ceiling applied to perf
work, and it says so explicitly in its own second paragraph: the pass was done
**in a sandbox with no database**, where `npm run build` cannot run (`build` is
`prisma migrate deploy && next build`). Its own words: *"Every finding below is
reasoned and type-checked (`tsc` clean), not measured... these are candidates,
ranked by structural risk, not proven regressions."*

When you cite this doc, preserve its own three-way split — don't flatten it:

1. **"Already tuned" table** — claims *verified against source* (e.g. React
   Query `staleTime`/`refetchOnWindowFocus: false` in
   `src/trpc/query-client.ts`, `httpBatchLink` in `src/trpc/client.tsx`). These
   are read-the-code facts, safe to restate as-is.
2. **Findings A/B/C** — structural-risk *candidates* (N+1s, unbounded lists,
   report scans). Reasoned, not profiled. Don't upgrade these to "confirmed
   perf bugs" without running an instrument from the table above against real
   data first.
3. **"Implemented in this pass"** — A.1–A.3 were actually coded and merged
   (bulk-loading `getClientPaymentBehaviorSummaries`, `buildProjectHealthInputs`,
   and cursor pagination on `tickets.list`), verified by `2110/2110 tests pass`
   + `tsc` clean at the time — **but the doc itself flags the `tickets`
   "Load more" interaction as "type-checked + unit-tested... but not
   runtime-verified (no DB/app in sandbox)."** Tests-green is not the same
   claim as works-in-the-running-app; don't conflate them when citing this doc.

If you're asked to advance any of the "recommended order of work" items in that
doc's closing section, the correct first step is always to reach for a real
instrument (perf-index check, `EXPLAIN ANALYZE`, or an actual profiler) before
writing anything down as a win — this doc is proof that "reasoned" and
"measured" are different claims, and the project has already been burned by
mixing them up. See the non-negotiable "sandbox-green ≠ done" rule.

## Common mistakes

- **Treating `apply-perf-indexes.mjs`'s clean exit as proof the index works.**
  It only proves the statement didn't error. Always follow with
  `check-perf-indexes.mjs`, and treat `invalid=0 missing=0` as the real signal.
- **Assuming a rerun of `apply-perf-indexes.mjs` fixes an INVALID index.** It
  won't — `IF NOT EXISTS` makes Postgres skip the rebuild. You must
  `DROP INDEX CONCURRENTLY "name"` by hand first.
- **Running either perf script against the transaction-pooler URL (port 6543)
  or an un-rewritten direct host** and getting a hang or a "cannot run inside a
  transaction block" error instead of understanding the scripts already handle
  this — check `DATABASE_URL`/`DIRECT_DATABASE_URL` in `.env` if you see this,
  don't add your own workaround on top of the existing rewrite.
- **Citing `docs/reviews/2026-06-24-performance-tuning-pass.md`'s findings A/B/C
  as confirmed bugs or proven wins.** The doc itself labels them reasoned, not
  measured — say "candidate, per the 2026-06-24 pass" until you've profiled it.
- **Treating `npm run test:coverage` percentage as a correctness signal.**
  Coverage counts execution, not assertion quality — see
  **lwd-validation-and-qa** for what actually counts as evidence.
- **Running `npm run analyze` and comparing its webpack bundle numbers directly
  against a normal Turbopack `next build`/`next dev` run.** `analyze` forces
  the webpack builder (`ANALYZE=true next build --webpack`); treat its output
  as directional composition info, not an apples-to-apples size number.
- **Believing a comment that says `next.config.ts` sets eslint
  `ignoreDuringBuilds`.** It doesn't (verified: no such key in the file as of
  this writing) — lint is simply not run as a CI step
  (`.github/workflows/ci.yml` has no lint step; see **lwd-build-and-env** for
  the full lint/type-check story). Don't restate that stale claim if you see it
  elsewhere.

## Provenance and maintenance

Date-stamped: 2026-07-05. Verified by opening (not recalling) each file below
in the actual repo at `/Users/mlaplante/.supacode/repos/LWD-Invoices/skills`:

- `scripts/apply-perf-indexes.mjs`, `scripts/check-perf-indexes.mjs` — full
  source read; pooler-URL rewrite, statement-splitting regex, "already exists"
  skip detection, `pg_index.indisvalid` query, exit-code semantics.
- `prisma/perf-indexes.sql` — full file read (162 lines); confirmed every
  statement is `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Name"` with an
  org-scoped or parent-scoped leading column, and the trailing note that
  `LateFeeEntry`/`RetainerTransaction`/`ReminderLog`/`SavedPaymentMethod` are
  intentionally skipped (already covered by `schema.prisma` `@@index`).
- `package.json` — confirmed `analyze`, `test`, `test:run`, `test:coverage`,
  `test:eval`, `db:migrate`, `db:studio` script bodies exactly as quoted above.
- `vitest.config.mts` — confirmed `coverage.reporter: ["text", "json-summary",
  "json"]` and the comment tying `json-summary`/`json` to
  `vitest-coverage-report-action`.
- `next.config.ts` — full file read; confirmed `typescript.ignoreBuildErrors:
  true` exists, and confirmed **no** `eslint.ignoreDuringBuilds` key exists
  anywhere in the file (contradicts a comment in `ci.yml` that claims it does —
  flagged as stale in Common mistakes above, per the same finding already
  documented in **lwd-build-and-env**'s provenance section).
- `.github/workflows/ci.yml` — confirmed the `check` job runs `tsc --noEmit`
  then `test:coverage` with no lint step; confirmed the `build` job uses
  placeholder env + bare `npx next build` (migrations not run there).
- `docs/reviews/2026-06-24-performance-tuning-pass.md` — full file read (112
  lines); every direct quote above ("reasoned and type-checked... not
  measured", the A/B/C triage, the "Implemented in this pass" section, the
  `tickets` "not runtime-verified" caveat) copied verbatim from source.
- `.claude/skills/lwd-run-and-operate/SKILL.md` — confirmed it explicitly defers
  "how/when to run" the perf-index scripts to this skill (line ~248–250 as of
  this writing).
- `.claude/skills/lwd-build-and-env/SKILL.md` — confirmed it already documents
  the `ignoreBuildErrors`/lint story and the `DIRECT_DATABASE_URL` pooler trap;
  cross-referenced rather than restated here.

Re-verify if things drift:

```bash
# perf-index scripts unchanged?
diff scripts/apply-perf-indexes.mjs .claude/skills/lwd-diagnostics-and-tooling/scripts/apply-perf-indexes.mjs
diff scripts/check-perf-indexes.mjs .claude/skills/lwd-diagnostics-and-tooling/scripts/check-perf-indexes.mjs

# how many indexes does perf-indexes.sql define right now?
grep -c 'CREATE INDEX CONCURRENTLY' prisma/perf-indexes.sql

# coverage reporters still include json-summary (required by CI's PR comment action)?
grep -n "reporter" vitest.config.mts

# does next.config.ts still lack eslint.ignoreDuringBuilds (i.e. is the ci.yml comment still stale)?
grep -n "ignoreDuringBuilds\|ignoreBuildErrors" next.config.ts

# does CI still skip lint?
grep -n "lint" .github/workflows/ci.yml || echo "no lint step found"

# is the perf-tuning doc's own verification-ceiling framing still intact?
head -20 docs/reviews/2026-06-24-performance-tuning-pass.md

# test:eval scope unchanged?
grep -n "test:eval" package.json
ls src/test/ai-eval
```

Uncertainties/candidates (not fully provable from static reading in this
no-DB sandbox, labeled accordingly):

- Whether an INVALID index, once present, actually surfaces as an "already
  exists" *error* to the `pg` client (counted as `skipped`) or as a silent
  success with a NOTICE (counted as `ok`) on rerun of `apply-perf-indexes.mjs` —
  reasoned from documented Postgres `IF NOT EXISTS` semantics, not observed
  against a live DB in this sandbox (no database available here). Either way
  the practical conclusion is unchanged: the invalid index is not rebuilt.
- Whether `npm run analyze`'s webpack-mode output differs materially in
  practice from the Turbopack path in this app specifically — flagged as
  "directional" rather than measured, since no build could be run in this
  sandbox to compare the two.
- Exact current pass/fail counts for `npm run test:eval` and `npm run
  test:coverage` — not run in this sandbox (no DB, and eval needs live provider
  keys for non-mocked assertions); only the commands and reporter
  configuration were verified from source.
