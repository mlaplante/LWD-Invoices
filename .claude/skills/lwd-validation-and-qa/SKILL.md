---
name: lwd-validation-and-qa
description: Use when deciding whether a change is actually proven safe to ship — what counts as evidence, whether "tsc clean + tests pass" is enough, how to add a test for a router/service, how to assert org-scoping in a test, or anything touching src/test/, vitest.config.mts, npm run test:run / test:coverage / test:eval, the AI eval golden suites (src/test/ai-eval, src/server/services/ai-eval), suite-gates.eval.test.ts, or the missing cross-org leakage test (AUDIT-2026-05 finding A5). Also use when someone claims a fix is "done" based only on green tests/build and you need to check the claim against the verification ceiling.
---

# LWD Invoices — Validation & QA (the evidence bar)

## Overview

**The core principle: a green `tsc --noEmit` and a green test suite are necessary, not
sufficient.** This project calls that gap the **verification ceiling** — the sandbox this
skill runs in has no database, and `npm run build` runs `prisma migrate deploy` before
`next build` (see `package.json`'s `"build"` script), so it cannot even attempt a real
build. Static types and mocked-Prisma unit tests can be perfectly green while a query is
still missing its `organizationId` filter, a migration hasn't actually been applied, or an
AI feature hallucinates a number no golden case happened to cover. Treat "the tests pass"
as one input to a shipping decision, not the decision itself.

This skill owns: what counts as evidence, the acceptance-threshold discipline (what gates
actually block CI vs. what's advisory), the full test/eval inventory, and the recipe for
adding a new test — including the one org-scoping assertion every test touching a
tRPC procedure should carry.

## When to use this / when NOT to use this

Use this skill when you're about to:
- Decide if a change is "done," and need to know what evidence is actually required.
- Add a test for a router, service, or AI feature and don't know the pattern.
- Touch anything under `src/test/`, `vitest.config.mts`, or the AI eval harness
  (`src/server/services/ai-eval/`, `src/test/ai-eval/`).
- Judge whether a coverage number or a "tests pass" claim is enough to merge.
- Pick up AUDIT-2026-05 finding A5 (no cross-org leakage test).

Use a sibling skill instead when the task is actually about:
- **Measuring** something (perf timing, query counts, bundle size) rather than deciding what
  counts as proof → `lwd-diagnostics-and-tooling`.
- **First-principles proof recipes** (e.g., proving a money calculation by hand, reconstructing
  an aggregate from raw rows) → `lwd-proof-and-analysis-toolkit`.
- **The gate-enforcement process** around a change (PR checklist, review discipline, when a
  change needs a migration) → `lwd-change-control`.
- **Why the system is shaped this way** (org-scoping mental model, router→service→db layering)
  → `lwd-architecture-contract`. This skill assumes that model; it doesn't re-teach it.
- **Domain facts** (invoice lifecycle, partial payments, retainers, DSO, tax) → `invoicing-domain-reference`.
- **A past incident's full story** (e.g., the `reopen` org-filter leak) → `lwd-failure-archaeology`.

## What actually gates CI (verified against `.github/workflows/ci.yml`)

| Job | Command | Blocks merge? |
|---|---|---|
| `check` → Type check | `npx tsc --noEmit` | Yes |
| `check` → Test | `npm run test:coverage` (tests must pass; **coverage % is not enforced**) | Yes (test failures only) |
| `check` → Coverage report | `davelosert/vitest-coverage-report-action@v2` | No — posts a PR comment, does not fail the job |
| `build` | `npx next build` with placeholder env vars, **no migration run** | Yes |
| `actionlint` | lints `.github/workflows/*.yml` | Yes |
| lint | `eslint` | **Disabled** — no lint step in `ci.yml` (ESLint 10 incompatibility, see the Test-step comment); `next.config.ts` only sets `typescript.ignoreBuildErrors: true` (a type-check skip in `next build`, unrelated to lint) |

Key nuance: `CONTRIBUTING.md`'s "Aim for >80% code coverage on critical paths" is a stated
goal, not a CI gate — there is no numeric coverage threshold anywhere in `ci.yml`. Don't cite
a coverage percentage as proof of sufficiency; cite which specific behaviors are asserted.

The `build` job builds with placeholder `DATABASE_URL`/Supabase env vars and does **not** run
`prisma migrate deploy` — that only happens on real Netlify deploys via `netlify.toml` (owned by
`lwd-build-and-env` / `lwd-change-control`, not this skill). A CI-green `build` job proves the
Next.js bundle compiles, not that the live schema matches it.

## The test inventory (re-verify before trusting a number — see Provenance)

- **~188 total test files**: 182 under `src/test/**/*.test.ts`, 5 under `src/__tests__/`
  (`portal-branding`, `stripe-tax`, `stripe-tax-invoice`, `stripe-tax-transaction`,
  `invoice-template-config`), and 1 under `src/server/services/ai-eval/fixtures/briefing.test.ts`.
- **Exact test-case count is not something to state as a fixed number.** Many suites use
  `it.each(...)`, which expands to one runtime case per fixture row — a static `grep` for
  `it(`/`test(` undercounts. Get the real number by running `npm run test:run` and reading
  the summary line; don't quote a remembered figure.
- Config: `vitest.config.mts` — `environment: "node"`, `globals: true`,
  `setupFiles: ["./src/test/setup.ts"]`, coverage provider `v8` with
  `reporter: ["text", "json-summary", "json"]` (json-summary + json are required by the CI
  coverage-report action, per the comment in the config file).
- `src/test/setup.ts` seeds fake env vars before any module loads (`DATABASE_URL`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `OPENAI_API_KEY`,
  `RECEIPT_OCR_PROVIDER=openai`, `GATEWAY_ENCRYPTION_KEY`, `RESEND_API_KEY`) and mocks two
  modules globally: `server-only` (so server modules import under vitest) and `next/cache`
  (`unstable_cache` becomes a passthrough; `revalidateTag`/`revalidatePath` become no-ops).
  Any new test relying on `unstable_cache` actually caching across calls will NOT see that —
  it's stubbed to a plain function call.

| Command | Runs | Use for |
|---|---|---|
| `npm run test` | vitest watch mode | local dev loop |
| `npm run test:run` | `vitest run` — full suite once | CI-equivalent local check |
| `npm run test:coverage` | `vitest run --coverage` | what CI actually runs |
| `npm run test:eval` | `vitest run src/test/ai-eval` | AI golden-suite gate only (see below) |

## The AI eval harness (non-negotiable #4: no AI feature without an eval)

Golden-set suites live in `src/server/services/ai-eval/` (runner + graders + gates) and are
exercised from `src/test/ai-eval/*.eval.test.ts` plus `runner.test.ts` and
`suite-gates.eval.test.ts`. `runAllEvalSuites()` in
`src/server/services/ai-eval/index.ts` is the single source of truth for which suites exist
and what gate each must clear — build any suite table from that file, not from test filenames,
because the registered names differ from them:

| Registered suite name (`index.ts`) | Test file | Gate: minScore / minPassRate |
|---|---|---|
| `receipt-ocr-parsing` | `ocr.eval.test.ts` | 0.95 / 1 |
| `reminder-fact-guard` | `reminder-guard.eval.test.ts` | 1 / 1 |
| `assistant-answer-grounding` | `grounding.eval.test.ts` | 1 / 1 |
| `month-end-close` | `month-end-close.eval.test.ts` | 1 / 1 |
| `invoice-review` | `invoice-review.eval.test.ts` | 1 / 1 |
| `expense-categorization` | `expense-categorization.eval.test.ts` | 1 / 1 |
| `collections-queue` | `collections-queue.eval.test.ts` | 1 / 1 |
| `proposal-generator` | `proposal-generator.eval.test.ts` | 1 / 1 |
| `weekly-briefing` | `src/server/services/ai-eval/fixtures/briefing.test.ts` (**not** under `src/test/ai-eval`) | 1 / 1 |

That's **9 suites**, not 8 — `weekly-briefing` lives outside `src/test/ai-eval/`. This has a
real consequence: `npm run test:eval` (`vitest run src/test/ai-eval`) does **not** execute
`briefing.test.ts` directly, but the `weekly-briefing` suite's gate is still enforced, because
`suite-gates.eval.test.ts` calls `runAllEvalSuites()`, which registers and runs all 9 suites
(including weekly-briefing) internally. So: `test:eval` still gates weekly-briefing via
`suite-gates.eval.test.ts`; it just doesn't separately run `briefing.test.ts`'s own
`it.each` assertions. If you add a 10th suite, register it in `index.ts`'s `runAllEvalSuites()`
or `suite-gates.eval.test.ts` will simply never see it.

How the gate mechanics work (verified in `runner.ts`/`suite-gates.eval.test.ts`):
- `runSuite(name, cases, grade)` runs every case, clamps an out-of-range grader score to
  `[0,1]`, and turns a thrown grader into a zero-score failure (not a crash).
- A case marked `critical: true` that fails is a **hard veto** — `suiteMeetsGate` returns
  `false` regardless of the aggregate score/pass-rate, matching non-negotiable #4's
  "critical-case veto."
- `formatSuiteReport` / `formatReports` print a scorecard on every run so a regression shows
  exactly which case moved — read the console output on a red `test:eval`, don't just see red
  and re-run.

**`scripts/ai-eval.ts` does not exist in this repo.** It's referenced in comments in both
`src/server/services/ai-eval/index.ts` and `runner.ts` ("the `scripts/ai-eval.ts` report"), but
as of 2026-07-05 no such file exists under `scripts/`. Don't tell anyone to run it — the only
verified entry point is `npm run test:eval` (and, transitively, `npm run test:run`/`test:coverage`,
which also pick up every `*.eval.test.ts` file since they run the whole `src` tree).

### How to add or extend an eval suite
1. Add fixtures to a new or existing file under `src/server/services/ai-eval/fixtures/`
   (follow the shape in `invoice-review.fixtures.ts` — each case has `id`, `input`, `expected`,
   optional `critical: true`, optional `description`).
2. Write or extend a grader in `src/server/services/ai-eval/graders.ts` returning
   `{ score: 0|1 (or fractional), detail? }`.
3. Register the suite + its gate in `runAllEvalSuites()` in `index.ts` — this is what makes
   `suite-gates.eval.test.ts` actually enforce it in CI.
4. If you want a dedicated eval test file (matching the existing 8), add
   `src/test/ai-eval/<name>.eval.test.ts` using `it.each` over your fixture array, mirroring
   `invoice-review.eval.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { gradeInvoiceReview } from "@/server/services/ai-eval";
   import { invoiceReviewCases } from "@/server/services/ai-eval/fixtures/invoice-review.fixtures";

   describe("golden: invoice review checks", () => {
     it.each(invoiceReviewCases.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
       const { score, detail } = gradeInvoiceReview(testCase.input, testCase.expected);
       expect(score, detail ?? testCase.description).toBe(1);
     });
   });
   ```
5. Never lower an existing gate's `minScore`/`minPassRate` to make a change pass — that's
   moving the goalpost the eval exists to hold. If a grader is wrong, fix the grader with its
   own justification, not the threshold.

## How to add a router/service test — the org-scoping assertion is not optional

Every test that exercises a tRPC procedure touching the DB must assert the query was
org-scoped — not just that it returned the right data. Two verified patterns:

**Pattern A — tRPC procedure, via `createMockContext`/`createCaller`.** This is the primary
pattern (`src/test/mocks/trpc-context.ts` re-exports `createMockContext`,
`createMockPrismaClient` from `./prisma`). `createMockContext()` defaults to
`{ orgId: "test-org-123", userId: "test-user-456", userRole: "OWNER", isActive: true }` and a
fully-mocked Prisma client (`vi.fn()` on every model method used across the codebase — check
`src/test/mocks/prisma.ts` and add a model/method there if yours is missing). Verified, real
example (`src/test/expenses-suggest.router.test.ts`, in full):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { expensesRouter } from "@/server/routers/expenses";
import { createMockContext } from "./mocks/trpc-context";

describe("expenses.suggestCategorization — multi-tenant isolation", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext(); // orgId: "test-org-123", role OWNER
    caller = expensesRouter.createCaller(ctx);
    ctx.db.expense.findMany.mockResolvedValue([]);
    ctx.db.expenseCategory.findMany.mockResolvedValue([]);
  });

  it("loads history and categories scoped to the caller's org", async () => {
    await caller.suggestCategorization({
      supplierId: "s1",
      supplierName: "AWS",
      expenseName: "Hosting",
      description: null,
    });
    expect(ctx.db.expense.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
    expect(ctx.db.expenseCategory.findMany.mock.calls[0][0].where.organizationId).toBe("test-org-123");
  });
});
```

That final pair of `expect(...where.organizationId).toBe("test-org-123")` assertions is the
part to copy into every new router test — asserting the mock was *called* is not enough, since
the exact bug this project has seen (a `reopen` mutation whose final `update()` omitted
`organizationId`, caught in review — see `docs/reviews/2026-04-06-...-review.md` /
`lwd-failure-archaeology`) would still make a "does it resolve without throwing" test pass.

**Pattern B — REST/service-level code, via `vi.mock`.** For code that doesn't go through a
tRPC router (e.g. `/api/v1/*` handlers), mock `@/server/db` and any external clients directly,
as in `src/test/v1-auth-membership.test.ts`:
```ts
vi.mock("@/server/db", () => ({
  db: { user: { findFirst: vi.fn() }, userOrganization: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));
```
then assert on `vi.mocked(db.<model>.<method>)`'s call args the same way.

## The open gap: no cross-org leakage test (AUDIT-2026-05, finding A5)

Verbatim from `docs/reviews/AUDIT-2026-05.md`:

> **A5** | Med | No cross-org leakage tests | Add a `__tests__/multi-tenant.test.ts` that
> creates two orgs and asserts every `getById`-style procedure returns `NOT_FOUND` (not the
> other org's row) when called with a foreign id.

As of 2026-07-05 this file does not exist anywhere in the repo (`find src -iname
"*multi-tenant*"` and `*cross-org*` both return nothing) — the gap is still open. If you pick
this up, treat the shape below as a **recommended pattern to build out, not working code
copied from the repo** (nothing like it currently runs, so nothing here has been executed):

1. Create context for org A (`createMockContext({ orgId: "org-a" })`) and org B
   (`createMockContext({ orgId: "org-b" })`), each with its own `createCaller`.
2. For each router with a `getById`/`getForOrg`-style read (invoices, clients, projects,
   expenses, etc.), mock the underlying Prisma `findUnique`/`findFirst` to return `null` when
   called with org B's context but org A's record id — i.e., assert the procedure's `where`
   clause actually includes `organizationId`, so a real (unmocked) Postgres query would never
   return the other org's row in the first place. Mocking `null` only proves the procedure
   *handles* a miss correctly, not that it *scoped* the query — pair it with the Pattern-A
   `where.organizationId` assertion so both the negative and positive path are covered.
3. Assert the procedure throws `TRPCError` with code `NOT_FOUND` (not e.g. an unhandled
   Prisma exception, and not a 200 with the wrong org's data).
4. Do this once per router family touching org-scoped, ID-addressable models rather than one
   giant test — keeps failures attributable. Cross-reference `lwd-architecture-contract` for
   which routers use `getForOrg()` vs. inline `where: { organizationId }` (~21 vs. ~347 sites
   per that audit) since the two call patterns need slightly different mock shapes.

## Common mistakes

- **Treating a green `test:coverage` run as proof of DB/UI/perf correctness.** It only proves
  the mocked-Prisma behavior matches assertions — it cannot catch a schema drift, a real RLS
  policy gap, or a slow query. That requires runtime evidence (see
  `lwd-diagnostics-and-tooling`, `lwd-proof-and-analysis-toolkit`).
- **Asserting the mock was called, not what it was called with.** `expect(db.invoice.update).toHaveBeenCalled()` would not have caught the `reopen` org-filter bug; only inspecting
  `mock.calls[0][0].where` would.
- **Quoting a coverage percentage as a merge gate.** It isn't one in this repo — `ci.yml` only
  posts it as a PR comment. Don't block or unblock a review on a coverage number.
- **Lowering an eval gate's `minScore`/`minPassRate` to get `test:eval` green.** That defeats
  the CI-veto's entire purpose (non-negotiable #4). Fix the grader or fixture, not the gate.
- **Assuming `npm run test:eval` runs `briefing.test.ts`.** It globs `src/test/ai-eval` only;
  `briefing.test.ts` lives under `src/server/services/ai-eval/fixtures/` and is picked up by
  the full-tree runs (`test`, `test:run`, `test:coverage`) instead. The `weekly-briefing` gate
  itself is still enforced via `suite-gates.eval.test.ts` regardless.
- **Citing `scripts/ai-eval.ts`.** It's dangling in comments only; it is not in the repo.
- **Relying on `unstable_cache` actually caching inside a test.** `src/test/setup.ts` mocks it
  to a passthrough — a test can't use it to prove memoization works.

## Provenance and maintenance

Verified 2026-07-05 against: `vitest.config.mts`, `src/test/setup.ts`,
`src/test/mocks/trpc-context.ts`, `src/test/mocks/prisma.ts`, `src/test/ai-eval/` (all 10
files, `ls`), `src/server/services/ai-eval/index.ts`, `src/server/services/ai-eval/runner.ts`
(header comment only), `src/test/ai-eval/runner.test.ts`, `src/test/ai-eval/suite-gates.eval.test.ts`,
`src/test/ai-eval/invoice-review.eval.test.ts`, `src/server/services/ai-eval/fixtures/briefing.test.ts`,
`src/test/expenses-suggest.router.test.ts`, `src/test/v1-auth-membership.test.ts`,
`docs/reviews/AUDIT-2026-05.md` (A5 finding + surrounding context), `CONTRIBUTING.md`
(Error Handling + Testing sections), `.github/workflows/ci.yml`, `package.json` (scripts),
`src/server/trpc.ts` (`protectedProcedure`/`requireRole`/`orgId` guarantee, lines ~14-72).

Could not verify: exact live test-case count (grep-based `it`/`test` counting undercounts
`it.each` fixture expansion, and this authoring sandbox has no `node_modules`/DB so
`npm run test:run` cannot be executed here to get a real number — this itself is an instance
of the verification ceiling this skill describes). AUDIT-2026-05's own baseline states "1390
vitest tests passing" as of May 2026; the suite has grown since (more files exist now) but the
current true count needs a live run, not a memorized figure.

Re-verify with:
```bash
# Test file inventory
find src -name "*.test.ts" | wc -l
find src/test -name "*.test.ts" | wc -l

# Eval suite registry — source of truth for names/gates, re-read if this table looks stale
sed -n '43,89p' src/server/services/ai-eval/index.ts

# Does scripts/ai-eval.ts exist yet?
ls scripts/ai-eval.ts 2>&1

# Has A5 (cross-org test) been picked up yet?
find src -iname "*multi-tenant*" -o -iname "*cross-org*"

# What CI actually gates
cat .github/workflows/ci.yml

# Real test-case count and pass/fail (requires deps installed + DB reachable)
npm run test:run
```
