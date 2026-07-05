---
name: lwd-proof-and-analysis-toolkit
description: Use when about to claim a financial number is correct, a mutation is org-scoped, a query is faster, an AI change didn't regress, or a forecast improved — before writing that claim in a PR, review, or commit. Trigger phrases — "this should be faster now", "I fixed the org-scoping", "numbers look right", "does this regress the eval"; or when touching forecast-accuracy.ts, revenue/profitability aggregation in reports.ts, a protectedProcedure with .update/.delete/.upsert, or check-perf-indexes.mjs. Not the QA evidence bar (lwd-validation-and-qa) or tool inventory (lwd-diagnostics-and-tooling) — this is the reasoning method: how to reduce a claim to a check that cannot lie to you.
---

# LWD Proof-and-Analysis Toolkit

## Overview

The core discipline: **don't eyeball it — reduce the claim to something that can only
be true or false, then run that thing.** "I read the code and it looks right" is not
proof in this codebase. Every recipe below follows the same shape:

1. State the claim precisely (a number, a boundary, a query count, a score).
2. Find or build the smallest artifact that can falsify the claim (a pure function +
   exhaustive tests, a foreign-org call, a query-count assertion, a golden-set score).
3. Run it and read the actual output — not what you expect the output to be.

This matters more here than in most codebases because three of the project's
non-negotiables are exactly "prove it, don't assume it": org-scoping (missing filter =
security incident), financial math (deterministic, no LLM arithmetic), and AI changes
(golden-set eval or it didn't ship). This skill is the reasoning method behind all
three. It is intentionally generic across features — the worked examples are drawn
from this repo's real history (and, in one case, a bug still sitting in the tree today)
so you can see the recipe applied, not just described.

## When to use / when NOT to use

Use this skill when you are about to *assert* correctness, performance, or safety and
want the check that would actually catch you being wrong.

| If you need... | Use instead |
|---|---|
| The evidence bar itself (what counts as "done", CI gates, coverage thresholds) | `lwd-validation-and-qa` |
| The instruments (how to run vitest, tsc, the perf scripts, log tooling) | `lwd-diagnostics-and-tooling` |
| Domain facts about invoices/payments/tax to reason correctly about the *shape* of the math | `invoicing-domain-reference` |
| The org-scoping mental model / why it exists, in depth | `lwd-architecture-contract` |
| A history of "we already tried this" traps | `lwd-failure-archaeology` |
| Forecast-model-specific bias/accuracy campaign work | `money-intelligence-campaign` |
| General "how do I even structure a research pass" guidance | `lwd-research-methodology` |

This skill owns the *recipes*; it does not restate the QA bar, the tool list, or the
domain glossary — cross-reference those skills instead of duplicating their content.

---

## Recipe 1 — Prove financial math (pure-function extraction)

**Claim shape:** "This number is computed correctly, including at the edges."

**Method:**
1. Find the calculation. If it's inline inside a router/service using `ctx`/Prisma,
   that's your first problem — you cannot exhaustively unit-test something that needs
   a database. Extract the arithmetic into a pure function: primitives in, primitives
   out, no `ctx`, no `await`.
2. Before touching the implementation, write down the edge cases as test names:
   zero, negative/underflow, exact boundary, values that trigger float/round drift,
   and — for this domain specifically — **partial payment** (money must come from
   `Payment` allocations, not pre-allocation line/invoice totals; round with the
   `round2` pattern, `Math.round(n * 100) / 100`, never string `toFixed` math).
3. Write the tests, then make them pass. Keep the pure function exported so the test
   file can import it directly (no mocking Prisma at all).

**Worked example — the good pattern:**
`src/server/services/forecast-accuracy.ts` is a genuinely pure module:
`scoreSnapshot(projected, actual)` takes two numbers and returns
`{ errorAmount, pctError, accuracy }`, with an explicit branch for `projected <= 0`
(nothing forecast — accuracy is 100 only if nothing arrived, 0 otherwise) and a
`round2()` helper applied to every output. `summarizeAccuracy()` builds on it per
horizon, including a signed `meanBiasPct` with a documented `±5%` tolerance band
(`BIAS_TOLERANCE_PCT`) before calling a horizon "over-" or "under-forecasting."

`src/test/forecast-accuracy.test.ts` is the exhaustive test: perfect forecast (100),
symmetric signed error (under vs. over score the same magnitude but opposite sign),
wild misses floored at 0 accuracy, the `projected === 0` edge case in both directions
(`scoreSnapshot(0,0)` → 100, `scoreSnapshot(0,250)` → 0), bias-direction crossing the
tolerance band, and grouping/sorting by horizon. None of it touches a database —
that's what makes it exhaustive rather than "one happy-path test."

**Worked example — the defect this recipe would have caught (verified live, 2026-07-05):**
`src/server/routers/reports.ts` has two sibling procedures that should agree on what
"revenue" means and don't:
- `profitabilityByClient` (lines 292–301) sums `Payment.amount` grouped by the
  invoice's `clientId`, filtered by `paidAt` — cash accounting, matches the
  non-negotiable ("money comes from Payment allocations, not line totals").
- `profitabilityByProject` (lines 380–408) sums `InvoiceLine.total` for lines tied to
  billed time/expenses, on invoices with `status IN ('PAID','SENT','PARTIALLY_PAID')`
  (`paidStatuses` at line 380). A `SENT`-but-unpaid invoice counts as full revenue here.

This exact discrepancy was flagged as a **Critical** in
`docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` ("Critical
Issue #2"). As of this writing it is still present in `reports.ts` and no test in
`src/test/` pins down which behavior is correct — `routers-reports-procedures.test.ts`
and `profitability-insights.test.ts` do not assert revenue-equals-payments for a
partially-paid fixture. Both procedures are inline `$queryRaw` SQL inside the router,
which is exactly why the discrepancy could ship silently: there's no pure function to
put a test on. **Do not treat this paragraph as "go fix it now"** — it's flagged here
as a live illustration of the recipe; route an actual fix through `lwd-change-control`.
If you do pick it up, the proof is: build an invoice, pay it partially, assert
`profitabilityByProject` revenue equals the `Payment` amount actually received, not
`InvoiceLine.total`.

**Checklist:**
- [ ] Can you call the calculation with plain values and no `ctx`/`db`? If not, extract until you can.
- [ ] Did you write the zero / negative / boundary / partial-payment cases as failing tests *before* changing the implementation?
- [ ] Does "revenue"/"paid" mean `Payment` amounts, not `InvoiceLine.total` or invoice `status`, anywhere the non-negotiable applies?
- [ ] Is rounding `Math.round(n * 100) / 100` applied consistently, not ad hoc `toFixed()` string formatting?
- [ ] Run it: `npx vitest run src/test/forecast-accuracy.test.ts` (or your new test file) — must be green with zero DB.

---

## Recipe 2 — Prove org isolation

**Claim shape:** "A caller in org A cannot read or write org B's row through this procedure."

**Why this is its own recipe, not folded into code review:** `protectedProcedure`
(`src/server/trpc.ts`) guarantees `ctx.orgId` is non-null, but it does **not**
guarantee every query in the procedure body uses it. AUDIT-2026-05 counted ~347
inline `where: { organizationId: ctx.orgId }` call sites as of May 2026; the
codebase has grown since (~523 by direct grep of that exact pattern in
`src/server/routers`, ~700+ across the broader `organizationId:` pattern in all of
`src/server` as of 2026-07-05) — see `lwd-architecture-contract`'s
org-scoping-census script for a current count. Whatever the count, there is no
compiler check that a given `update`/`delete` call includes it. A
`findUnique`/`findFirst` guard earlier in the same function proves nothing about a
later write in the same function.

**Method:**
1. For the procedure under test, identify every `.update(`, `.updateMany(`, `.delete(`,
   `.deleteMany(`, `.upsert(` call on `ctx.db` (or a transaction client).
2. For each one, confirm `organizationId: ctx.orgId` (or an equivalent `getForOrg`
   helper) is in that call's own `where` — not just in an earlier read in the same
   function. An earlier scoped read does not protect a later unscoped write.
3. The strong version of the proof (what AUDIT-2026-05 finding **A5** asks for, still
   open as of this writing — no `src/test/**/*multi-tenant*` or `*cross-org*` file
   exists in the repo): construct two orgs and call the procedure with an id that
   belongs to the *other* org, assert `NOT_FOUND` (never the other org's row, never a
   silent cross-org write). This needs a real Postgres, not the sandbox mocked-Prisma
   harness — see the verification-ceiling non-negotiable and `lwd-validation-and-qa`
   for where that test can actually run.
4. The weaker (but sandbox-runnable) proxy already used in this repo is a mocked-Prisma
   assertion that the call *shape* includes `organizationId`, e.g.
   `src/test/routers-additional-coverage.test.ts` (`projectTask.updateMany` assertion,
   `expect(...).toHaveBeenCalledWith(expect.objectContaining({ where: { milestoneId: "m_1", organizationId: "test-org-123" } }))`).
   This is useful but strictly weaker than step 3: because the mock returns whatever
   you told `findUnique` to return regardless of the id/org passed in, this style
   **cannot** catch a write call that has simply dropped the `organizationId` clause
   entirely — it only catches the call if you also assert on that specific call's
   arguments. Don't mistake "the router's `findUnique` is scoped" for "every write in
   the router is scoped."

**Worked example — the bug this recipe is built to catch:**
`docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`, Critical
Issue #1: `milestones.ts` `reopen` read with `findUnique({ where: { id, organizationId:
ctx.orgId } })` but then wrote with `update({ where: { id: input.id } })` — no org
filter on the write. **This one is fixed** — current `reopen` (lines 174–188) now
scopes both the read (178) and the write (185).

**The same bug pattern, still open — verified live, 2026-07-05:** the fix in `reopen`
was not applied to its sibling `complete` in the same file. `milestones.ts` `complete`
(lines 91–172) does the correct scoped `findUnique` at line 95, but then has **two**
unscoped writes: the transactional path (`tx.milestone.update({ where: { id: input.id
}, ... })`, line 145–148) and the non-auto-invoice path (`ctx.db.milestone.update({
where: { id: input.id }, ... })`, line 168–171). Neither includes `organizationId`.
The identical anti-pattern (scoped read, unscoped write) also currently exists in
`src/server/routers/disputes.ts` at three call sites: `updateNotes` (line 68–70),
`submitEvidence`'s resync (line 121–124), and `accept` (line 160–163) — all read via
`findFirst({ where: { id, organizationId: ctx.orgId } })` and then write via
`update({ where: { id } })` with no org filter. **This is a live, present-tense
finding as of this writing** — it was discovered while verifying this skill, using
the scanner below, not from the historical review doc. Route it to `lwd-change-control`
for triage/fix; this skill's job is the method, not the patch.

**Tooling — heuristic first pass:**
`scripts/scan-write-scoping.mjs` (ships with this skill) greps every
`ctx.db.<model>.{update,updateMany,delete,deleteMany,upsert}(` call under
`src/server/routers` and `src/server/services` and flags any call with no
`organizationId` within a short character window as a `CANDIDATE`. It is a **textual
heuristic, not a proof** — it has both false positives (e.g. `team.ts:115`,
`ctx.db.user.updateMany({ where: { supabaseId: ctx.userId } })`, which is correct as
written: `User` has no `organizationId` column and is scoped by caller identity, not
by org) and false negatives (a filter one call away via a helper). Every line it
prints is a lead to open and read, never a verdict — treat it exactly like the
project's own audit-doc caveat: "agents *do* hallucinate occasionally — verify every
claim against the source" (`docs/reviews/AUDIT-2026-05.md`).

```bash
# From repo root:
node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs

# Scope to one file:
node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs src/server/routers/milestones.ts
```

**Checklist:**
- [ ] Every `.update`/`.updateMany`/`.delete`/`.deleteMany`/`.upsert` in the procedure has `organizationId: ctx.orgId` (or a `getForOrg` helper) in *that same call's* `where` — not just in an earlier read.
- [ ] If the model genuinely has no org column (e.g. `User`, scoped by `supabaseId`/identity), say so explicitly in review — don't let the scanner's false positive stand unexplained.
- [ ] For anything touching money or PII: does a real two-org test exist, or only a mocked call-shape assertion? Label which one you have.
- [ ] Run the scanner on any router you touch before calling a change org-safe: `node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs <path>`.

---

## Recipe 3 — Prove a perf claim

**Claim shape:** "This is faster" / "this avoids N+1" / "this index is used."

**Never from reading the code.** The project's own perf pass says so explicitly:
`docs/reviews/2026-06-24-performance-tuning-pass.md` states its **verification
ceiling** up front — done in a sandbox with no database, `npm run build` not runnable
(the build script runs `prisma migrate deploy` first, per non-negotiable #2), so
"every finding below is **reasoned and type-checked (`tsc` clean), not measured**...
Anything touching the DB must be profiled against real data before it's treated as a
confirmed win." That pass explicitly separated "genuine, worth fixing" findings from
"implemented" ones, and even the implemented ones carry a `tsc`-clean + unit-test-green
disclaimer, not a timing number (see "2110/2110 tests pass, `tsc` clean" — not "N ms
faster").

**Method:**
1. Reproduce the *before* state against real data (staging, or a seeded local DB) —
   count queries (log Prisma queries, or count `$queryRaw`/`findMany` calls hit) and/or
   time the endpoint. Write the number down.
2. Apply the change.
3. Re-measure the same way. The claim is proven only by the after-number, not by "this
   should be O(1) instead of O(n) now."
4. If the change relies on a new or existing index, confirm the index is not just
   *present* but **VALID** — `CREATE INDEX CONCURRENTLY` leaves an `INVALID` index
   behind on a failed build, and an invalid index is silently never used by the
   planner.

**Tooling:** `scripts/check-perf-indexes.mjs` — connects to the DB (via
`DATABASE_URL`/`DIRECT_DATABASE_URL`, session-pooler-aware) and checks every index name
declared in `prisma/perf-indexes.sql` (161 lines, matched via regex on
`CREATE INDEX CONCURRENTLY IF NOT EXISTS "..."`) against `pg_index.indisvalid`, printing
`✓`, `✗ MISSING`, or `✗ INVALID` per index and exiting non-zero if anything is missing
or invalid.

```bash
node scripts/check-perf-indexes.mjs
# On MISSING/INVALID:
node scripts/apply-perf-indexes.mjs   # drop any INVALID index first, then re-apply
```

**Worked example — findings correctly labeled "reasoned, not measured":**
the 2026-06-24 pass lists concrete N+1 candidates with exact locations —
`src/server/routers/collections.ts:202` firing one `invoice.findMany` per client via
`Promise.all(clientIds.map(getClientPaymentBehaviorSummary))`, and
`src/server/services/project-health-data.ts:188` firing 3–4 queries per project — and
tags both "worth fixing (verify with a profiler first)" rather than claiming a speedup.
The doc's own roadmap ("Recommended order of work") starts with "when a profiler is
available," not with "already faster."

**Checklist:**
- [ ] Do you have a real before-number (query count and/or wall time against seeded/staging data), not a structural argument?
- [ ] Did you re-measure after, the same way?
- [ ] If an index is load-bearing for the claim, did `check-perf-indexes.mjs` confirm `indisvalid = true`, not just that the name exists?
- [ ] Are you labeling anything you *didn't* measure as "reasoned, not measured" — matching this repo's own convention — rather than implying it's proven?

---

## Recipe 4 — Prove an AI change didn't regress

**Claim shape:** "Swapping models / editing a prompt / touching a guard didn't break AI behavior."

**Method:** an AI-touching change is proven safe only when it clears the golden-set eval
suite, including its critical-case veto — never by reading the prompt diff or by one
manual chat transcript.

```bash
npm run test:eval        # == vitest run src/test/ai-eval  (package.json)
```

**What "clears" means, concretely** (`src/server/services/ai-eval/runner.ts`,
`suiteMeetsGate`): a suite passes its gate only if **all three** hold —
`criticalFailures.length === 0` (an absolute veto — a single failed `critical: true`
case fails the suite regardless of mean score), `score >= minScore`, and
`passRate >= minPassRate`. Per-suite gates are registered in
`src/server/services/ai-eval/index.ts`: most suites (reminder fact-guard, assistant
grounding, invoice review, month-end close, expense categorization, collections queue,
proposal generator, briefing) require `{ minScore: 1, minPassRate: 1 }` — every labeled
case must hold exactly; `receipt-ocr-parsing` is the one suite allowed a hair of slack
(`{ minScore: 0.95, minPassRate: 1 }`) for non-critical formatting edge cases, while
still requiring every case to individually pass. The CI gate itself is
`src/test/ai-eval/suite-gates.eval.test.ts`, which asserts, per registered suite, zero
critical failures, the score gate, the pass-rate gate, and the combined
`passedGate` boolean — and prints the full per-case report (`formatReports`) on every
run so a regression names the exact case and field that moved.

**Do not** hand-roll a new eval mechanism for a new AI feature — extend one of the
existing suites/fixtures under `src/test/ai-eval/` and `src/server/services/ai-eval/fixtures/`
(structure: `graders.ts`, `grounding.ts`, `index.ts`, `runner.ts`, `types.ts` in the
service, one golden-case `*.fixtures.ts` per suite). Most suites also get their own
`*.eval.test.ts` in `src/test/ai-eval/`, but that's not required for gate coverage —
the `weekly-briefing` suite (registered in `index.ts`, gate `{minScore:1,
minPassRate:1}`) has no dedicated test file and is still gated purely through the
generic per-suite loop in `suite-gates.eval.test.ts`. This is the non-negotiable: *no
AI feature ships without a golden-set eval and a CI gate.*

**Checklist:**
- [ ] Did you run `npm run test:eval` after the change, not just the general suite?
- [ ] Did any `critical: true` case fail? If so the suite fails regardless of mean score — that is by design, not a bug in the harness.
- [ ] If you added a new AI-touching behavior, did you add cases to an existing suite (or a new suite with its own gate in `ai-eval/index.ts`) rather than skip eval coverage?
- [ ] Did you read the printed per-case report, not just the pass/fail exit code?

---

## Recipe 5 — Prove a forecast improvement

**Claim shape:** "The forecast is more accurate now" (cash-flow projection, collections
timing, etc.).

**Method:** measure **bias** (signed, directional error — is the forecast running hot
or cold?) and **mean accuracy**, computed only over **matured** snapshots — a snapshot
whose forecast horizon has actually closed and been compared against real collected
payments. An unmatured snapshot has no `actualInflow` yet and cannot be scored.
Predict the number *before* you look (see `lwd-research-methodology` for the
predict-first discipline) — a bias/accuracy claim made after peeking at the answer is
not a prediction.

**Tooling:** `summarizeAccuracy(snapshots)` and `describeBias(summary)` in
`src/server/services/forecast-accuracy.ts` are the grading primitives — group matured
snapshots by `horizonDays`, get `meanAccuracy` and signed `meanBiasPct` per horizon
(`biasDirection` flips to `"over-forecasting"` / `"under-forecasting"` outside a
`±5%` tolerance band), and a human-readable bias sentence for the UI. Before/after a
model or methodology change, run the *same* matured-snapshot set through
`summarizeAccuracy` both ways and diff `meanAccuracy` / `meanBiasPct` per horizon —
that diff is the proof, not a description of what should have improved.

This recipe is intentionally thin here — the campaign-specific playbook (which
horizons to track, how to source matured snapshots, target thresholds) lives in
`money-intelligence-campaign`; this entry exists so the pure-scoring primitive
(Recipe 1) and the bias/accuracy measurement discipline are cross-referenced from one
place.

**Checklist:**
- [ ] Are you scoring only *matured* snapshots (horizon closed, `actualInflow` known)?
- [ ] Did you write down the predicted before/after `meanBiasPct` and `meanAccuracy` before running `summarizeAccuracy`?
- [ ] Is the comparison apples-to-apples — same snapshot set, same horizons, before vs. after?

---

## Common mistakes

- **Treating a code-review read-through as proof.** Every recipe above exists because
  "I read it, looks right" missed the `reopen` org-scoping bug and still hasn't caught
  the same pattern in `complete`/`disputes.ts` (Recipe 2) or the `profitabilityByProject`
  revenue mismatch (Recipe 1) — both went unnoticed by a full code review pass.
- **Confirming a mocked call-shape assertion is the same as a real cross-org test.**
  It proves the call was made with the right arguments in *that* mocked scenario; it
  does not prove a foreign-org call gets rejected end-to-end (Recipe 2).
- **Reporting a perf/index change as fixed because `tsc` and unit tests pass.** That
  clears the verification ceiling in a sandbox with no DB — it is not a timing or
  query-count proof (Recipe 3, and the project-wide "sandbox-green ≠ done" rule).
  Likewise, "the index migration ran" is not "the index is valid" — always run
  `check-perf-indexes.mjs`.
- **Trusting a static-review/audit doc's file:line claims at face value, in either
  direction.** Re-open the file. Some flagged issues here were fixed (`reopen`); the
  identical pattern was not fixed elsewhere in the same file (`complete`) or in a
  different router (`disputes.ts`) — a review doc's "fixed" or "open" status can be
  stale in both directions. See `lwd-failure-archaeology` for the "verify docs against
  current source" discipline in more depth.
- **Trusting the write-scoping scanner's output as a verdict.** It's a heuristic grep;
  confirm every `CANDIDATE` by reading the file (see `team.ts:115` false-positive
  above) before reporting it as a finding.
- **Shipping an AI change because "the response looked right in one manual test."**
  Only `npm run test:eval` with zero critical failures counts (Recipe 4).

---

## Provenance and maintenance

Authored 2026-07-05. Facts and line numbers below were verified by opening each file
directly on that date — re-run the one-liners if you suspect drift (line numbers move
as files are edited).

**Files verified:**
- `src/server/services/forecast-accuracy.ts` (round2, scoreSnapshot, summarizeAccuracy, describeBias, `BIAS_TOLERANCE_PCT`)
- `src/test/forecast-accuracy.test.ts` (exhaustive edge-case tests, no DB)
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` (Critical Issues #1 `reopen`, #2 `profitabilityByProject`)
- `docs/reviews/AUDIT-2026-05.md` (finding A5: no cross-org leakage test suite, still a roadmap item; "How to extend this audit" hallucination caveat)
- `src/server/routers/reports.ts` lines 287–470 (`profitabilityByClient` vs. `profitabilityByProject`, `paidStatuses` at line 380)
- `src/server/routers/milestones.ts` (full file — confirmed `reopen` fixed at lines 174–188; confirmed `complete` still unscoped at lines 145–148 and 168–171)
- `src/server/routers/disputes.ts` (confirmed the same scoped-read/unscoped-write pattern at lines 63–70, 118–124, 144–163)
- `src/server/routers/team.ts` line 109–119 (`updateProfile`, confirmed correct as-is: `User` has no `organizationId`, scoped by `supabaseId`)
- `src/test/routers-additional-coverage.test.ts` (mocked-Prisma call-shape assertion pattern, lines ~730–766)
- `scripts/check-perf-indexes.mjs` (full file — index-validity check via `pg_index.indisvalid`)
- `docs/reviews/2026-06-24-performance-tuning-pass.md` (verification-ceiling framing, N+1 findings, "reasoned, not measured")
- `src/test/ai-eval/` directory listing + `suite-gates.eval.test.ts` (full file)
- `src/server/services/ai-eval/runner.ts` (full file — `suiteMeetsGate`, critical-failure veto) and `index.ts` (per-suite gates, `{minScore, minPassRate}` table)
- `package.json` scripts (`test`, `test:run`, `test:coverage`, `test:eval`, `build`)
- `vitest.config.mts` (node environment, no DB dependency for unit tests)

**Known stale reference, corrected here:** a comment in
`src/server/services/ai-eval/index.ts` mentions "`scripts/ai-eval.ts`" as an
alternate report entry point — as of 2026-07-05 no such file exists in `scripts/`
(only `apply-perf-indexes.mjs`, `baseline-existing-migrations.ts`,
`check-perf-indexes.mjs`). Use `npm run test:eval` — it is real and verified.

**Re-verification commands:**
```bash
# Financial-math pure function still pure / still tested:
npx vitest run src/test/forecast-accuracy.test.ts

# Is the profitabilityByProject/Client discrepancy still open?
grep -n "paidStatuses" -A3 src/server/routers/reports.ts

# Is the milestones.ts `complete` org-scoping gap still open?
sed -n '140,172p' src/server/routers/milestones.ts

# Re-scan for the scoped-read/unscoped-write pattern repo-wide (heuristic):
node .claude/skills/lwd-proof-and-analysis-toolkit/scripts/scan-write-scoping.mjs

# Perf index validity against the real DB:
node scripts/check-perf-indexes.mjs

# AI eval gate, full report:
npm run test:eval
```

**Uncertainties / candidates (not fully closed):**
- The `profitabilityByProject` revenue discrepancy (Recipe 1) and the `complete`/
  `disputes.ts` org-scoping gaps (Recipe 2) are reported here as **direct
  observations from reading current source on 2026-07-05** — not as an official
  triaged finding. They have not been run against a live DB or filed through
  `lwd-change-control`; treat them as verified-in-code-as-written, not as
  confirmed-exploitable-in-production.
- `scan-write-scoping.mjs` is a new, unreviewed heuristic script authored for this
  skill. It was smoke-tested against the live repo (see examples above) but has no
  test suite of its own and is intentionally conservative in its claims (see its
  header comment).
