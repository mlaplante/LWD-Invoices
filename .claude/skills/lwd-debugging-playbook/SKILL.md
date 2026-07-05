---
name: lwd-debugging-playbook
description: Use when triaging a live or reported bug in LWD Invoices and you need to go from symptom to root-cause class fast — "column X does not exist" 500s, a page showing another org's data, NOT_FOUND on a record that should exist, portal 401/403 or endless redirect to portal-login, an AI feature (OCR, collections queue, proposal generator, month-end close) that regressed, a page that "feels slow", tests green but the deployed app broken, Stripe/PayPal webhook double-charging or duplicate emails, or `DATABASE_URL`/Supabase connection hangs. Gives a symptom-to-discriminating-check table, not root-cause narratives (see lwd-failure-archaeology) or profiling methodology (see lwd-diagnostics-and-tooling).
---

# LWD Debugging Playbook

## Overview

This project has a short list of failure modes that repeat because they share one
root shape: **something upstream silently drifted from something downstream**
(live DB from schema, a redirect cookie's path from the route that reads it, a
secret from the one it's compared against, an eval score from the model behind
it). The fix is never to guess — it's to run **one discriminating check** that
tells you which of 2–3 candidate causes you actually have, then act.

Two rules override every row below:

1. **The sandbox has no database.** `npm run build` runs `prisma migrate deploy`
   first and will hang/fail here; `prisma migrate status` and
   `scripts/apply-perf-indexes.mjs` need a real `DATABASE_URL`/`DIRECT_DATABASE_URL`
   and are **not runnable in this sandbox**. If a "DB command" in the table below
   hangs instead of erroring, that alone is not evidence of a pooler bug — it may
   just be "no sandbox DB." Confirm you're somewhere with real DB access before
   trusting the result.
2. **tsc-clean + tests-green is not "verified."** It rules out type and logic
   regressions; it says nothing about the live DB, the deployed bundle, or a UI
   flow. Don't close a ticket on that basis alone.

## When to use / when NOT to use

Use this skill the moment you have a **symptom** (an error string, a wrong page,
a stuck redirect) and need to narrow it to a cause fast.

- Want the org-scoping mental model itself (why the filter matters, how
  `ctx.orgId` is derived) → **lwd-architecture-contract**.
- Want the full story of a past incident (what happened, what the fix PR looked
  like, lessons) → **lwd-failure-archaeology**.
- Want to actually profile/measure a slow page (flags, tools, how to read
  `EXPLAIN ANALYZE`) → **lwd-diagnostics-and-tooling**.
- Want to run the test suite / coverage / eval gate mechanics in depth → **lwd-validation-and-qa**.
- Want env var / secret provisioning details → **lwd-config-and-flags** or **lwd-security-and-secrets**.
- Want the build/deploy pipeline itself (not just "did migrations run") → **lwd-build-and-env**.

## Symptom → triage table

| Symptom | Likely cause | Discriminating check | Fix / next step |
|---|---|---|---|
| `column X does not exist` (or similar Prisma schema-mismatch) 500 on any page, right after a deploy | Live DB drifted behind `schema.prisma` — migrations didn't run on deploy | `npx prisma migrate status` (needs real DB access — see rule 1 above). Also open `netlify.toml` and confirm the `[build] command` still contains `prisma migrate deploy` (it's `prisma generate && prisma migrate deploy && next build` as of this writing — a comment in the file warns against removing it, and a past revert (`f4e70cb`) exists in git history for exactly this) | Redeploy after confirming the build command; if migrations are stuck, resolve via `prisma migrate resolve` per Prisma's own error output — don't hand-edit the DB |
| One org's page shows another org's data, or an action silently affects the wrong tenant's rows | A query/mutation is missing its `organizationId` filter | Find the exact mutation and read its **final write** (`update`/`delete`/`create`) — not just the `findFirst`/`findUnique` above it. A real bug in this codebase had the read scoped by `organizationId: ctx.orgId` but the trailing `update({ where: { id: input.id } })` was not (`docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`, the `reopen`/`update`/`delete` trio). `grep -n "where: { id" src/server/routers/<router>.ts` and check every hit for a missing `organizationId` | Add `organizationId: ctx.orgId` to the write's `where`. Every `protectedProcedure` guarantees `ctx.orgId` is non-null (`src/server/trpc.ts`) — there's no excuse for it to be absent |
| `NOT_FOUND` (tRPC) thrown for a record you're sure exists | Either it's genuinely in another org (correct behavior — `findFirst`/`findUnique` scoped by `organizationId` returns nothing, which is by design so IDs from another tenant don't leak existence), or the ID itself is stale/wrong | Query the record directly by `id` with `SELECT organization_id FROM ...` (or Prisma Studio) and compare to the caller's `activeOrgId` cookie / `ctx.orgId`. If they differ, it's not a bug — the user is in the wrong org context | If it IS the same org and still 404s, check whether the router scopes on a *different* field than the actual tenant column (e.g. `clientId` instead of `organizationId` on a join) |
| Portal page (`/portal/[token]`) keeps redirecting to `/portal/portal-login/[token]` even with the right passphrase | Passphrase truly wrong, OR the session cookie exists but the shared secret used to sign vs. verify differs | Check `PORTAL_SESSION_SECRET` is set and **≥ 32 chars** in every environment that needs to agree (prod web + any function). `getPortalSessionSecret()` (`src/lib/portal-session.ts`) silently falls back to `SUPABASE_SERVICE_ROLE_KEY` when `PORTAL_SESSION_SECRET` is unset or short — a session signed under one secret verifies as invalid under the other with **no error, just a silent redirect** | Set/rotate `PORTAL_SESSION_SECRET` consistently (`.env.example` documents it as a 64-hex-char key, e.g. `openssl rand -hex 32`) everywhere the app runs |
| Portal page loads fine, but `/api/portal/[token]/pdf`, `/estimate`, or `/proposal-pdf` return 401 `Unauthorized` | Cookie-path regression: the auth cookie was set with too narrow a `path` | Check `src/app/api/portal/[token]/auth/route.ts` — the cookie is deliberately set with `path: "/"` (not scoped to `/portal/[token]`) specifically because the API routes live under `/api/portal/...` and a browser won't send a path-scoped cookie there. If someone "cleaned up" the cookie options and narrowed the path, this is the regression | Restore `path: "/"` on the `portal_auth_${token}` cookie in the auth route |
| Any external gateway call (Stripe/PayPal) processes a payment or refund twice, or sends a duplicate receipt email | Webhook handler returned a non-2xx (or threw) for a **transient** downstream error, so the provider retried and re-ran the whole handler | Check the webhook route's response codes: `src/app/api/webhooks/stripe/route.ts` only returns non-2xx for a bad signature/payload (`validateStripeWebhook`) or a genuinely malformed request (e.g. `webhookJson({error:"Missing invoiceId"}, {status:400})`); everything else acks `{received:true}`. If a handler is throwing/returning an error status for something that isn't "bad payload," that violates error bucket 3 (see `CONTRIBUTING.md` → Error Handling) and will cause reprocessing. Idempotency is also enforced by `markProcessed`/`wasProcessed` (`webhook-dedup` service) plus an in-memory `processedEvents` map — check whether that dedup ledger itself is failing (e.g. DB write erroring) before assuming the handler logic is wrong | Fix the handler to only return non-2xx for signature/payload failures per bucket 3; verify the dedup table write is succeeding |
| An AI-backed feature (OCR receipt parsing, collections queue, proposal generator, month-end close narration, expense categorization, invoice review, reminder guard) starts giving worse/wrong output after a prompt, model, or provider change | Regression in the golden-set eval, not a one-off hallucination | `npm run test:eval` (runs `vitest run src/test/ai-eval`). Read the printed scorecard (`formatReports` output) — it names which suite, which case ID, and which field moved. `src/test/ai-eval/suite-gates.eval.test.ts` is the actual CI gate: it asserts zero `criticalFailures`, a minimum mean score, and a minimum pass rate per suite, and this file runs as part of the normal `npm run test:coverage` step in CI (there is no separate eval job in `.github/workflows/ci.yml`) | Don't hand-patch the model output — trace the failing case ID back to its suite file (`src/test/ai-eval/*.eval.test.ts`) and either fix the guard/prompt or, if the regression is real and expected (e.g. a deliberate prompt change), update the golden case with an explanation. Per the project's non-negotiables, no AI feature ships without this suite covering it |
| A page "feels slow" | Usually an N+1 query, but don't trust that without measuring | Do NOT reach for a fix yet — read `docs/reviews/2026-06-24-performance-tuning-pass.md` first. It documents confirmed N+1 shapes already found by reading (not profiling) the code (e.g. collections/dunning page, project-health page) and explicitly labels them **unmeasured, reasoned-only** because the pass was done with no DB in sandbox. Treat any "perf fix" the same way until it's profiled against real data — see **lwd-diagnostics-and-tooling** for how to actually measure | If you're in an environment with real DB access, profile before changing query shape; don't assume the doc's ranked list is still accurate post-fixes (some items in it were already implemented — read the "Implemented in this pass" section) |
| Tests pass locally (`npm run test:coverage` all green, `tsc --noEmit` clean) but the behavior is wrong when you actually click through the app | You verified in the sandbox, which has no DB and can't run `next build`/`next dev` against a real Supabase instance | Check `src/test/setup.ts` — it stubs `DATABASE_URL`, Supabase URLs/keys, and mocks `next/cache`'s `unstable_cache`/`revalidateTag`/`revalidatePath` as pass-throughs specifically so server modules import without a real Next runtime or DB. That's necessary for unit tests but means **no unit test in this repo exercises a real query, a real cache invalidation, or a real page render** | Get real-data runtime proof (see **lwd-diagnostics-and-tooling** and **lwd-run-and-operate**) before declaring anything DB- or cache-shaped "done" — this is the "verification ceiling" |
| `DATABASE_URL`/Supabase connection hangs (migrations, scripts, direct `psql`) instead of failing fast | Connecting via the IPv6-only direct host, or a transaction-mode pooler URL where DDL is unsupported | Check the hostname/port in use. `prisma.config.ts` prefers `DIRECT_DATABASE_URL` (falling back to `DATABASE_URL`) for migrations specifically because "transaction-pooler URLs (port 6543) do NOT support DDL." `scripts/apply-perf-indexes.mjs` rewrites a `*.pooler.supabase.com` URL to port `5432` with `pgbouncer`/`pool_timeout`/`connection_limit` params stripped, to get a session-mode connection that supports `CREATE INDEX CONCURRENTLY` without needing IPv6-only direct access | For migrations/DDL/long-lived scripts, use a session-pooler or direct URL on port 5432, not the transaction pooler on 6543. Copy the URL-rewrite pattern from `apply-perf-indexes.mjs` (`buildSessionPoolerUrl`) rather than reinventing it |

## Common mistakes (traps that cost real time)

- **Trusting `prisma migrate status` output from the sandbox.** It has no DB — the
  command hangs or errors for reasons unrelated to the actual deploy. Only run it
  somewhere with real DB access, then it's authoritative.
- **Auditing only the `findFirst`/`findUnique` for org-scoping and stopping there.**
  The read being scoped proves nothing about the write below it — always check the
  final `update`/`delete`/`create` clause too (see the reopen bug above).
- **Assuming a portal 401 is "wrong passphrase" without checking the secret and the
  cookie path first.** Both fail silently (no thrown error, no log) — a passphrase
  retry loop will not fix either.
- **Treating `docs/reviews/2026-06-24-performance-tuning-pass.md` as a list of
  confirmed regressions.** It says explicitly it is reasoned/type-checked, not
  measured, and some items in it were already fixed in the same pass — read the
  "Implemented in this pass" section before acting on the "Findings, triaged"
  section.
- **Declaring a fix "done" because `npm run test:coverage` is green.** That step
  stubs the DB and Next runtime (`src/test/setup.ts`); it cannot see a live schema
  mismatch, a real cache invalidation, or a real page render.
- **"Fixing" a webhook by making it return an error status on any internal
  failure.** That looks safer but causes the provider to retry and reprocess —
  only signature/payload failures should be non-2xx (CONTRIBUTING.md error bucket
  3).

## Provenance and maintenance

Verified 2026-07-05 against this repo's actual source (not memory, not the seed
notes above — every claim here was re-confirmed by opening the file):

- `netlify.toml` — build command and its inline warning comment
- `src/server/trpc.ts` — `protectedProcedure` guarantees `orgId`/`userId` non-null
- `src/lib/portal-session.ts` — `getPortalSessionSecret` fallback and length check
- `src/app/api/portal/[token]/auth/route.ts` — cookie `path: "/"` comment and 401 responses
- `src/app/portal/[token]/layout.tsx` — redirect-to-portal-login behavior
- `src/app/api/portal/[token]/pdf/route.ts`, `estimate/route.ts`, `proposal-pdf/route.ts` — 401 pattern
- `scripts/apply-perf-indexes.mjs` — session-pooler URL rewrite
- `prisma.config.ts` — `DIRECT_DATABASE_URL`/transaction-pooler DDL note
- `docs/reviews/2026-06-24-performance-tuning-pass.md` — perf findings + "verification ceiling" framing
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` — the `reopen`/`update`/`delete` missing-`organizationId` bug
- `CONTRIBUTING.md` — the three error-handling buckets
- `src/test/setup.ts` — stubbed env vars, `next/cache` mocks
- `vitest.config.mts` — no `ai-eval` exclusion, so it runs under the normal suite
- `.github/workflows/ci.yml` — confirms `test:coverage` (not a separate job) is the gate that runs `src/test/ai-eval`
- `src/test/ai-eval/suite-gates.eval.test.ts` — the actual gate assertions (critical failures, score, pass rate)
- `src/app/api/webhooks/stripe/route.ts` — dedup ledger + non-2xx only on bad signature/payload
- `.env.example` — `PORTAL_SESSION_SECRET` documented as a 64-hex-char key

One number to flag: `grep -rn "organizationId: ctx.orgId" src/server/routers | wc -l`
returned **523** hits when checked on 2026-07-05, not the ~347 sometimes quoted
elsewhere for "inline `where: {organizationId}` call sites" — that ~347 figure is
audit-era (AUDIT-2026-05) and stale; it may also count a wider pattern set
(services, other `where` shapes) across a larger scope than just this one grep.
This count drifts as the codebase changes — treat 523 as a point-in-time reading,
not a permanent fact, and re-run the command below if you need a current count.

Re-verification commands (run from repo root, on a machine with real DB access
where noted):

```bash
# netlify.toml still runs migrations on deploy
grep -n "prisma migrate deploy" netlify.toml

# live DB vs schema.prisma drift (needs real DATABASE_URL/DIRECT_DATABASE_URL)
npx prisma migrate status

# CI still runs the eval suite as part of the normal test gate (no separate job)
grep -n "test:coverage\|ai-eval" .github/workflows/ci.yml

# portal session secret is still documented and fallback logic unchanged
grep -n "PORTAL_SESSION_SECRET" .env.example src/lib/portal-session.ts

# current count of the one specific org-scoping grep pattern used above
grep -rn "organizationId: ctx.orgId" src/server/routers | wc -l

# perf-tuning doc still exists and still carries the "not measured" caveat
grep -n "Verification ceiling" docs/reviews/2026-06-24-performance-tuning-pass.md
```

Uncertainties / not independently verified in this pass:
- Whether `docs/reviews/2026-06-24-performance-tuning-pass.md`'s "Findings,
  triaged" section still reflects the current code (it may have been acted on
  further since 2026-06-24) — re-read it, don't just cite it, before using it to
  justify a change.
- Whether every AI-feature router funnels through `src/test/ai-eval` today, or
  only the eight suites listed (`collections-queue`, `expense-categorization`,
  `grounding`, `invoice-review`, `month-end-close`, `ocr`, `proposal-generator`,
  `reminder-guard`) — confirmed those eight exist as files; did not verify there
  isn't a ninth AI feature with no eval coverage (that would itself be a
  non-negotiable violation worth flagging if found).
