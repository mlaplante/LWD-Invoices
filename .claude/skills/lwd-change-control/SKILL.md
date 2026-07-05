---
name: lwd-change-control
description: Use when opening, reviewing, or merging any PR in LWD Invoices; when deciding what a change is "allowed" to do (schema/migration edits, org-scoped queries, AI-touching code, financial-math/rounding, webhook handlers, perf work); when a reviewer asks "does this need an eval/migration/org filter?"; when CI is red or green and you need to know what that does/doesn't prove; or when touching netlify.toml, .github/workflows/ci.yml, package.json build scripts, next.config.ts, or the pre-commit hook. Also load this before writing a commit message, filling out the PR template, or explaining why "sandbox tests pass" isn't the same as "safe to ship".
---

# LWD Change Control

## Overview

One idea governs every rule below: **this is a multi-tenant money system, and the
blast radius of a mistake is either "another org's data" or "a wrong number on an
invoice."** Every gate in this skill exists because one of those two things already
went wrong once, was caught, and got turned into a checklist item. This skill is the
doctrine hub — it tells you *which* gate a change must clear and *why*. It does not
re-teach the mechanics of running migrations, writing evals, or hardening secrets;
it points you to the skill that owns each of those.

## When to use / When NOT to use

Use this skill to classify a change and decide which gates apply before you write
code, and again before you open a PR. It is the front door.

Once you know which gate applies, jump to the sibling that owns the mechanics:

| Need to... | Use instead |
|---|---|
| Run/write a migration, understand `prisma migrate deploy` mechanics | `lwd-run-and-operate` |
| Build/extend a golden-set AI eval, understand fact-guards | `lwd-validation-and-qa` |
| Rotate a secret, handle a leaked key, harden an endpoint | `lwd-security-and-secrets` |
| Debug a failing test/build/runtime error | `lwd-debugging-playbook` |
| Understand *why* a past incident happened in detail | `lwd-failure-archaeology` |
| Understand router/service/db layering, `protectedProcedure` internals | `lwd-architecture-contract` |
| Look up invoice/payment/tax domain rules | `invoicing-domain-reference` |
| Look up an env var, feature flag, config value | `lwd-config-and-flags` |
| Set up local dev, understand build tooling | `lwd-build-and-env` |
| Run performance/data verification with real numbers | `lwd-proof-and-analysis-toolkit` |

Do NOT use this skill to look up a specific command's flags in depth (e.g. exact
`prisma migrate` syntax) — it only tells you *that* a migration gate applies, not
*how* to run one.

## The change-control pipeline (ground truth)

1. Branch from `main` (conventional prefix, e.g. `feature/...` or `fix/...` per
   `CONTRIBUTING.md`).
2. Commit with a conventional-commit type: `feat`, `fix`, `docs`, `style`,
   `refactor`, `test`, `chore` (`CONTRIBUTING.md`).
3. Open a PR — GitHub renders `.github/pull_request_template.md`: **Summary**,
   **Changes**, **Testing** checklist (`Tested locally`, `No build errors
   (npm run build)`, `No new security vulnerabilities (npm audit)`), **Related
   Issues**.
4. `.github/workflows/ci.yml` runs three jobs on every PR and every push to `main`:

   | Job | What it actually does | What it does NOT do |
   |---|---|---|
   | `check` (15 min) | `npm ci` → `npx prisma generate` → `npx tsc --noEmit` → `npm run test:coverage` (full Vitest suite incl. `src/test/ai-eval/*`, since `vitest.config.mts` has no include filter — coverage IS the AI-eval gate) → posts a coverage comment via `davelosert/vitest-coverage-report-action@v2` | Lint (see below). Does not touch a real database. |
   | `build` (20 min) | `npx next build` with `SKIP_ENV_VALIDATION=1` and placeholder env vars (`DATABASE_URL=postgresql://placeholder:placeholder@...`, placeholder Supabase URL/keys). Proves the app *compiles and prerenders*. Caches `.next/cache` keyed on lockfile + source hash. | **Does NOT run `prisma migrate deploy`** — the workflow comment says so explicitly: "Migrations are NOT run here — netlify.toml owns `prisma migrate deploy` on real deploys." |
   | `actionlint` (5 min) | Lints the workflow YAML files themselves | Nothing about your app code |

   Node version pinned to **22** in every job (`actions/setup-node@v5`).

5. Lint is **not part of CI or the build**. There is no lint step in `ci.yml`'s
   `check` job (the comment: "Lint is disabled until eslint-config-next is
   compatible with ESLint 10 (eslint-plugin-react crashes: `contextOrFilename.
   getFilename is not a function`)"). **Correction to a common misconception:**
   `next.config.ts`'s `typescript: { ignoreBuildErrors: true }` is a *type-check*
   skip during `next build` (redundant work avoidance — `tsc --noEmit` already
   runs as its own CI step, saving ~10–20s), not a lint skip; `next.config.ts` has
   no `eslint.ignoreDuringBuilds` flag. `eslint.config.mjs` still exists and
   `npm run lint` still works locally/in-editor — it is simply never invoked by
   any CI job or by `npm run build`. Do not rely on lint to catch anything; it
   catches nothing in the pipeline that actually gates a merge.
6. `githooks/pre-commit` runs `gitleaks git --pre-commit --staged` locally
   (secret scan on staged diff before you can even commit). `.github/workflows/
   gitleaks.yml` re-runs the same class of scan in CI on every push/PR with full
   history (`fetch-depth: 0`) as a second, un-bypassable line of defense.
7. Other always-on workflows: `codeql.yml` (static security analysis, weekly +
   every push/PR to `main`), `dependabot-auto-merge.yml`, `weekly-dependency-
   update.yml`, `supabase-heartbeat.yml`.
8. Deploy is **Netlify**, not CI. `netlify.toml`'s build command is
   `prisma generate && prisma migrate deploy && next build` — this is a
   completely separate execution from the CI `build` job and from `package.json`'s
   own `build` script (`prisma migrate deploy && next build`); **`netlify.toml`
   overrides `package.json`'s build script entirely for the actual deploy.**

## The seven non-negotiable gates

These are hard rules, not style preferences. Each has already caused, or been one
step from causing, a real incident. A PR that violates one of these should not be
approved regardless of how clean the rest of the diff is.

| # | Gate | Incident behind it | What "clearing the gate" means | Owning sibling |
|---|---|---|---|---|
| 1 | **Org-scoping is paramount** | `docs/reviews/2026-04-06-...-review.md` finding #1: `src/server/routers/milestones.ts` — the `reopen` mutation's `findUnique` correctly checked `organizationId: ctx.orgId`, but its final `update` used `where: { id: input.id }` only (no org filter). Same pattern flagged at `update` (line 56) and `delete` (line 73) in the same router. If the earlier read were ever stale or bypassed, the write itself had zero tenant guard. Caught in review, not in prod, but it shipped past `tsc`, tests, and a first pass of review. | Every DB read/write that touches org-scoped data filters by `organizationId: ctx.orgId` — including the FINAL write in multi-step mutations, not just the initial lookup. `protectedProcedure` (`src/server/trpc.ts`) guarantees `ctx.orgId` is non-null once auth passes; it does NOT retroactively guard a `where` clause you forgot to write. `AUDIT-2026-05.md` item A4 counts ~347 inline `where:{organizationId}` sites vs. only ~21 using the `getForOrg()` helper (`src/server/lib/get-for-org.ts`) — the inline pattern is dominant and each one is a manual, re-provable claim. | `lwd-architecture-contract` (mental model), `lwd-security-and-secrets` (IDOR/multi-tenant hardening) |
| 2 | **netlify.toml owns migrations** | `git show f4e70cb` — "revert: remove prisma migrate deploy from build (DB unreachable from Netlify)" (Apr 2 2026, 1-line diff). Someone removed `prisma migrate deploy` from the Netlify build command (plausibly to fix a build-time DB connectivity error) and it had to be reverted because the fix caused the live DB schema to drift behind `schema.prisma` — new columns referenced by app code didn't exist yet, producing `"column X does not exist"` 500s in production. | The build command in `netlify.toml` MUST keep `prisma generate && prisma migrate deploy && next build`, in that order, every deploy. If the Netlify build genuinely can't reach the DB, that's a networking/env problem to fix — never a reason to drop the migration step. | `lwd-run-and-operate` (migration mechanics, DB-unreachable troubleshooting) |
| 3 | **Financial math is deterministic** | Same review doc, finding #2: `src/server/routers/reports.ts` (`profitabilityByProject`, lines ~438–443) summed `InvoiceLine.total` (the pre-payment, invoiced amount) as "revenue" instead of summing actual `Payment` rows — the same review's `profitabilityByClient` correctly does payments-only, filtered by `paidAt`. Result: a `SENT`-but-unpaid invoice counted as earned revenue, and the client tab vs. project tab showed inconsistent numbers for the same underlying data — a real, shipped calculation-correctness defect, not a hypothetical. | Money the UI displays as "paid"/"revenue" comes from summing actual `Payment` rows tied to an invoice (grep pattern: `invoice.payments.reduce((sum, p) => sum + toNum(p.amount), 0)`, used consistently in `analytics-data.ts`, `ar-reports.ts`, `automation-runner.ts`, `books-assistant.ts`, `credit-hold.ts`, `month-end-close.ts`) — never derived from pre-payment line/invoice totals when the question is "how much has actually been collected." Rounding uses the repeated `Math.round(n * 100) / 100` pattern (`round2`, reimplemented per-file in `mileage.ts`, `forecast-accuracy.ts`, `early-payment-discount.ts`, `expense-budgets.ts`, `tax-calculator.ts` — there is no single shared `round2` util; match the local pattern, don't invent a new rounding scheme). An LLM never computes a financial number — it only narrates numbers that came from this kind of deterministic path. | `invoicing-domain-reference` (invoice lifecycle, tax, AR rules) |
| 4 | **No AI feature ships without an eval** | Golden-set harness lives at `src/test/ai-eval/*.eval.test.ts` (e.g. `invoice-review.eval.test.ts`, `grounding.eval.test.ts`, `ocr.eval.test.ts`, `reminder-guard.eval.test.ts`). `suite-gates.eval.test.ts` is the CI gate: it calls `runAllEvalSuites()` and asserts, per suite, zero `criticalFailures`, `score >= gate.minScore`, and `passRate >= gate.minPassRate`. Because `vitest.config.mts` has no test-file include filter, these run automatically inside `npm run test:coverage` in CI's `check` job — you cannot merge a red eval suite. Run just this surface locally with `npm run test:eval`. | Any change that adds/edits an LLM-touching code path (prompt, parser, guard, model/provider swap) must land with or extend a golden-set case, and must not introduce a critical-case failure. A critical failure is a hard veto regardless of aggregate score. | `lwd-validation-and-qa` (harness mechanics, fact-guards, grounding) |
| 5 | **Sandbox-green ≠ done** | Structural: the dev sandbox has no database, and `npm run build` runs `prisma migrate deploy` first (per `package.json`), so `npm run build` cannot even execute without a reachable DB. `tsc --noEmit` + Vitest passing proves types and unit-level logic — it proves nothing about a real Postgres query, a real Supabase Storage signed URL, or real-data performance. | Any claim about DB behavior, UI behavior against real data, or perf must be verified against a real environment (staging or production data), not asserted from sandbox-green CI. Treat "tests pass" as necessary, never sufficient, for DB/UI/perf claims. | `lwd-proof-and-analysis-toolkit` (how to get real-data proof), `lwd-debugging-playbook` |
| 6 | **Error-handling has exactly 3 buckets** | Doctrine, `CONTRIBUTING.md` "Error Handling" section (verbatim rules, not paraphrase): (1) **critical-path mutations** (tRPC procedures, REST mutators — invoice create/update, payment recording, gateway config) throw `TRPCError` / return non-2xx, **never swallow**; (2) **non-critical side effects** (audit logs, follow-up emails, automation fan-out, notifications) wrap in `try/catch`, `console.error` with a `[module]` prefix, and continue — a failed audit row must not unwind a succeeded user-facing operation; (3) **external webhooks** (Stripe, Resend) always return 2xx unless payload/signature is bad — never re-throw, or the provider retries and you double-process. `AUDIT-2026-05.md`'s Notifications fix is a real example of bucket drift being corrected: a `try/catch` that silently returned `[]`/`0` on DB errors was removed so failures "surface as real failures instead of appearing as 'no notifications'" — i.e., someone had put a bucket-1-shaped path into bucket-2 handling. | Before writing a `catch`, ask "if this fails, should the user see an error?" Yes → bucket 1. No, and it's ours → bucket 2. No, and it's an inbound webhook → bucket 3. Never invent a fourth pattern (e.g. silently returning an empty array from what is actually a critical read). | — (doctrine only; no sibling owns this beyond `CONTRIBUTING.md` itself) |
| 7 | **Lint is not a gate** | `ci.yml` comment: ESLint 10 breaks `eslint-config-next` (`eslint-plugin-react` crash). Rather than block all PRs on a broken tool, lint was removed from CI entirely. | Do not treat `npm run lint` output as blocking, and do not assume `next build`/CI catches lint issues — they don't. The real gates are `tsc --noEmit`, `test:coverage` (incl. AI evals), `next build`, `actionlint`, and the `gitleaks` pre-commit hook + CI scan. | — |

## Change classification → required gates

Use this table to decide, before coding, which of the above gates your change must
clear (a change can hit more than one row).

| Change type | Must clear | Notes |
|---|---|---|
| Prisma schema / migration edit | Gate 2, Gate 5 | Verify locally against a real DB — sandbox can't run `prisma migrate deploy`. See `lwd-run-and-operate`. |
| Any new/edited query or mutation touching org-scoped data | Gate 1 | Check every `where` in the code path, including the *last* write in multi-step mutations — that's exactly where the milestones.ts bug hid. |
| AI/LLM-touching code (prompt, parser, guard, model swap, provider fallback change) | Gate 4, Gate 5 | Extend the matching `*.eval.test.ts`; run `npm run test:eval` before opening the PR. |
| Anything computing/displaying a money value (revenue, balance, tax, discount) | Gate 3, Gate 6 (bucket 1 if it's a mutation) | Ask "is this summing actual `Payment` rows, or a pre-payment total?" — that distinction is the exact class of bug in incident #3. |
| New/edited webhook handler (Stripe, Resend, PayPal IPN, etc.) | Gate 6 (bucket 3), Gate 5 | Verify against real provider payloads/signatures where possible — this is a DB/runtime claim, not a unit-test claim. |
| Performance change (query shape, batching, caching) | Gate 5 | A benchmark against sandbox has no DB to measure against; needs staging/prod-shaped data. See `lwd-proof-and-analysis-toolkit`. |
| Docs-only change | None of the above | Still gets `check`/`build`/`actionlint` for free; low risk. |
| CI/build/deploy config change (`ci.yml`, `netlify.toml`, `package.json` scripts, `next.config.ts`) | Gate 2 and Gate 7 apply directly — re-read this skill's pipeline section before touching these files | The single highest-leverage place to reintroduce the Gate 2 incident is exactly these files. |

## Worked example: reviewing a mutation for Gate 1 and Gate 3 together

`src/server/routers/milestones.ts`'s `reopen`/`update`/`delete` incident and
`src/server/routers/reports.ts`'s `profitabilityByProject` incident came from the
**same PR review** (`docs/reviews/2026-04-06-...-review.md`), which is a useful
reminder: a change that looks "done" (all three milestone features + forecasting
"faithfully aligned with the spec," per the review's own opening line) can still
carry a Gate 1 defect in a write clause and a Gate 3 defect in a revenue query at
the same time. When reviewing a diff, check both explicitly rather than trusting
that "org scoping looked fine at the top of the function" or "the tests pass" is
sufficient. **See `lwd-failure-archaeology` §3/§4 for the full incident history,
current line numbers, and open/closed status** — this section only re-derives the
minimum code shape needed to classify a diff into Gate 1 / Gate 3 at review time,
and mirrors failure-archaeology's version rather than independently tracking it.
As of failure-archaeology's 2026-07-05 verification: the Gate 1 milestones.ts
write-clause bug (shape A below) is **settled** in current source; the Gate 3
`profitabilityByProject` bug (revenue query below) is **still open** — treat the
"WRONG" snippet as illustrative of the pattern to catch in review, not as a
claim about what's currently deployed:

```ts
// WRONG — org check only on the read, not the write (Gate 1 violation)
const milestone = await ctx.db.milestone.findUnique({
  where: { id: input.id, organizationId: ctx.orgId },
});
// ...
return ctx.db.milestone.update({
  where: { id: input.id },              // <-- missing organizationId
  data: { completedAt: null },
});

// RIGHT
return ctx.db.milestone.update({
  where: { id: input.id, organizationId: ctx.orgId },
  data: { completedAt: null },
});
```

```ts
// WRONG — revenue from pre-payment line totals (Gate 3 violation)
const revenue = lines
  .filter(l => paidStatuses.includes(l.invoice.status)) // includes "SENT"
  .reduce((sum, l) => sum + toNum(l.total), 0);

// RIGHT — revenue from actual payments received
const revenue = invoice.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
```

## Common mistakes

- **Trusting the initial `findUnique`/`findFirst` org check to cover the whole
  function.** Every subsequent `update`/`delete`/`create` in the same handler needs
  its own `organizationId` filter (or `getForOrg()`). Gate 1 was violated exactly
  this way.
- **"CI is green" used as proof of a DB, UI, or perf claim.** CI's `build` job
  explicitly runs against a placeholder `DATABASE_URL` and never runs migrations.
  Green CI proves compile/type/unit-test correctness — nothing about live-database
  behavior (Gate 5).
- **Assuming lint would have caught something.** It's not wired into CI or the
  build; don't cite it as a safety net in a review comment.
- **Removing `prisma migrate deploy` from `netlify.toml` to fix a build error.**
  This exact edit was made and reverted once already (`f4e70cb`); if the Netlify
  build can't reach the DB, that's the bug to fix, not the migration step.
- **Summing `InvoiceLine.total` (or any pre-payment total) when the question is
  "how much money came in."** Use actual `Payment` rows. Mixing the two bases
  (as `profitabilityByProject` vs. `profitabilityByClient` did) produces two
  different "correct-looking" numbers for the same data.
- **Adding a new LLM call path without touching `src/test/ai-eval/`.** It will
  still pass `tsc` and generic unit tests; it will not have proven anything about
  output quality, and `suite-gates.eval.test.ts` won't be protecting the new path.
- **Putting a bucket-1 (critical) failure into bucket-2 (swallow + continue)
  handling**, e.g. silently returning `[]`/`0` on a DB error instead of throwing —
  the exact drift `AUDIT-2026-05.md` had to fix in the notifications router.

## Provenance and maintenance

Verified 2026-07-05 against: `CONTRIBUTING.md`, `.github/workflows/ci.yml`,
`.github/workflows/gitleaks.yml`, `.github/workflows/codeql.yml`,
`.github/pull_request_template.md`, `netlify.toml`, `githooks/pre-commit`,
`package.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`,
`prisma/schema.prisma` (Payment model, lines 843–865), `src/server/trpc.ts`,
`src/server/lib/get-for-org.ts`, `docs/reviews/2026-04-06-profitability-
milestones-forecasting-review.md`, `docs/reviews/AUDIT-2026-05.md`,
`src/test/ai-eval/suite-gates.eval.test.ts`, `git show f4e70cb`, and a repo-wide
grep for `invoice.payments.reduce` and `round2` usage. No script is shipped with
this skill — it is pure doctrine; re-verify the load-bearing claims periodically:

```bash
# Confirm the migration step is still in the Netlify build command
grep -n "prisma migrate deploy" netlify.toml

# Confirm CI still has no lint step and the same three jobs
grep -n "^  [a-z]*:$" .github/workflows/ci.yml

# Confirm the reopen/update/delete org-scoping fix has not regressed
grep -n "organizationId" src/server/routers/milestones.ts

# Confirm the AI-eval gate still runs inside the coverage job (no include filter
# in vitest.config.mts that would exclude src/test/ai-eval)
grep -n "include\|exclude" vitest.config.mts

# Re-count inline org-scoping sites vs. getForOrg() usage (AUDIT-2026-05 A4 baseline: ~347 vs ~21)
grep -rl "organizationId" src/server/routers | wc -l
grep -rl "getForOrg" src/server | wc -l

# Confirm the f4e70cb revert commit is still reachable (history not rewritten)
git show --stat f4e70cb
```

Uncertainties/labels applied in this skill:
- The count "~347 inline `organizationId` where-clauses vs. ~21 `getForOrg()` call
  sites" is cited from `AUDIT-2026-05.md` item A4 (not independently re-derived by
  exact grep, since the phrasing/formatting of inline filters varies enough that a
  naive grep undercounts) — treat as the audit's own figure, order-of-magnitude
  accurate, not a byte-exact live count.
- There is no single shared `round2` utility function in the codebase; it is
  independently reimplemented (same one-line formula) in at least five files.
  Do not describe it as a shared helper in code review comments.
- The seed brief's phrasing "Payment allocations" does not correspond to an actual
  `PaymentAllocation` Prisma model — there isn't one. The real mechanism is
  summing `Payment` rows directly against `Invoice.payments`; this skill uses that
  more precise description throughout.
