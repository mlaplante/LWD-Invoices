---
name: lwd-research-frontier
description: Use when asked what LWD Invoices should build next, where the AI/analytics features could "advance," or to scope a research/ML improvement to cash-flow-forecast.ts, forecast-accuracy.ts, client-payment-score.ts, collection-risk.ts, dunning.ts, or benchmarking.ts — i.e. requests like "improve the forecast model," "can we predict payment probability better," "optimize dunning," "add a smarter benchmarking metric," or "what's the next research bet for Money Intelligence." Not for implementing a specific ticket (see lwd-change-control) or for how to validate a claim once you have one (see lwd-research-methodology).
---

# LWD Research Frontier

## Overview

This project's AI/analytics surface ("Money Intelligence" — see `README.md`'s AI & Analytics
section) is mostly **deterministic heuristics dressed as intelligence**: fixed aging-probability
tables, hand-tuned point additions, hand-picked cohort bands. That's a legitimate, auditable
starting point — not a finished one. This skill inventories the concrete places where a better
model could replace or augment a heuristic, and for each one states:

- **why the current approach is limited** (grounded in the actual code, not vibes),
- **the repo asset it builds on** (a real file/model you'd extend, not a new system),
- **first 3 steps in this repo**,
- **the falsifiable milestone** — a number that must move, measured on real data, not sandbox
  output.

**"Advancement" = measurably better numbers on real data.** Not novelty, not a fancier model,
not "this feels smarter." Non-negotiable #5 (verification ceiling) applies at full force here:
nothing on this page can be graded in the sandbox. There is no database in the sandbox, and every
milestone below requires production rows (`ForecastSnapshot`, `PaymentAttempt`, real invoices) to
score. tsc passing or a new unit test passing is not evidence a candidate model is better —
it only proves the code runs.

## When to use / when NOT to use

Use this skill when scoping a *net-new research direction* on the AI/analytics surface — deciding
what to build, what "better" would even mean, and what asset already exists to build on.

Do NOT use this skill for:
- **Executing** an approved forecast/dunning improvement end-to-end (data pipeline, CI gate,
  rollout) — see `money-intelligence-campaign`.
- **How to prove a hunch is real** (experiment design, statistical rigor, avoiding p-hacking on
  small tenants) — see `lwd-research-methodology`.
- **Any other AI feature's eval mechanics** (fact-guards, grounding, OCR, month-end-close) — see
  `lwd-validation-and-qa` or the AI Eval section of `README.md`; this skill only owns the four
  candidates below.
- **Understanding invoice/payment domain concepts** (DSO, aging buckets, retainers) — see
  `invoicing-domain-reference`.
- **Making an actual code change** to any of these files — see `lwd-change-control` for the
  org-scoping and review discipline that applies to every mutation.

## The four candidates

| # | Candidate | Repo asset (heuristic to beat) | Measurement harness today |
|---|---|---|---|
| 1 | Forecast beyond static aging-weights | `src/server/services/cash-flow-forecast.ts` | **Exists** — `forecast-accuracy.ts` grades matured `ForecastSnapshot` rows |
| 2 | Payment-probability calibration | `src/server/services/client-payment-score.ts`, `collection-risk.ts` | **Does not exist** — no prediction is ever persisted for later grading |
| 3 | Dunning/collections recovery | `src/server/services/dunning.ts`, `collection-risk.ts` | **Partially exists** — real outcome data is in the DB (`PaymentAttempt`, `Payment`), but nothing currently aggregates it into a recovery-rate metric; the collections eval (`collections-queue.eval.test.ts`) only checks sort order, not recovery |
| 4 | Benchmarking cohort intelligence | `src/server/services/benchmarking.ts`, `benchmarking-data.ts` | **Does not exist** — pure math is unit-tested with synthetic numbers, never validated against production distributions |

Each is expanded below. Verified 2026-07-05 against the files named; if any file's shape changed,
re-open it — do not trust the line-level claims here without a re-check (see Provenance).

---

### 1. Forecast beyond static aging-weights

**Why the current approach is limited.** `projectCashFlow()` in `cash-flow-forecast.ts` weights
every open invoice by a fixed step function of `daysOverdue`:

```
collectionProbabilityForAging(daysOverdue):
  <=0   -> 0.95
  <=30  -> 0.90
  <=60  -> 0.75
  <=90  -> 0.55
  else  -> 0.35
```

(`cash-flow-forecast.ts:154-161`). Recurring invoices get a flat `0.97` (autopay) or `0.90`
(non-autopay) regardless of the org's actual history (`AUTOPAY_PROBABILITY`,
`RECURRING_INVOICE_PROBABILITY`, lines 138-139). These weights are the same for every org,
every client, every industry — a one-person freelancer and a 50-client agency get identical
probability curves. A model that conditions on the *specific* client's or org's real payment
history should beat this baseline.

**Repo asset it builds on.** `ForecastSnapshot` (prisma/schema.prisma, model at line 380) already
stores, per org per horizon: `capturedAt`, `horizonDays`, `projectedInflow`, `projectedOutflow`,
`confidence`, and — once matured — `actualInflow` + `scoredAt`. The weekly cron
(`src/inngest/functions/forecast-snapshots.ts`, `0 5 * * 1`) writes these and scores them.
`forecast-accuracy.ts`'s `summarizeAccuracy()` already reduces scored snapshots to
`meanAccuracy`, `meanBiasPct`, and `biasDirection` per horizon, surfaced via the
`analytics.forecastAccuracy` tRPC procedure (`src/server/routers/analytics.ts:256-289`, correctly
org-scoped by `organizationId: ctx.orgId`).

**The trap — read before proposing anything.** `ForecastSnapshot` persists the baseline's
*output* (`projectedInflow`) and the *actual* outcome, but **not the model's inputs** (the open
invoices, their ages, the recurring schedule at capture time). You cannot retroactively
re-project a new model against historical snapshot rows — the inputs that produced them are
gone. "Evaluate the new model on held-out history" is **not available on day one**. The only
honest path is prospective: log the candidate model's projection *alongside* the existing
baseline projection in new snapshots going forward, then grade both against the same
`actualInflow` once each cohort of snapshots matures (30/60/90 days later).

**First 3 steps in this repo:**
1. Add a nullable column (e.g. `candidateInflow`, `candidateModelVersion`) to `ForecastSnapshot`
   via a real Prisma migration (never hand-edit `schema.prisma` without `prisma migrate dev`, and
   never touch the `prisma migrate deploy` step in `netlify.toml` — non-negotiable #2).
2. In `forecast-snapshots.ts`'s capture step, compute the candidate model's projection alongside
   `projectCashFlow()`'s and write both.
3. Wait for a full horizon window to mature, then extend `forecast-accuracy.ts` (or a sibling
   function) to `summarizeAccuracy()` the candidate column the same way, so both baseline and
   candidate report `meanAccuracy` / `meanBiasPct` side by side.

**Falsifiable milestone.** You have a result when, on held-out **matured** `ForecastSnapshot` rows
(not synthetic data, not sandbox fixtures), the candidate model's `mean(|meanBiasPct|)` across
horizons is measurably lower than the baseline's, by a margin stated *before* you look at the
data (e.g. "beats baseline mean absolute bias by ≥5 percentage points, sustained across ≥2
consecutive maturity cycles so it isn't one lucky quarter"). Anything less is noise, not a win —
see `lwd-research-methodology` for how to set that margin honestly.

---

### 2. Payment-probability calibration

**Why the current approach is limited.** `scoreCollectionRisk()` in `collection-risk.ts` builds
`lateRiskPercent` / `paymentProbabilityPercent` from additive point rules (e.g. `100 -
clientOnTimePercent`, `+clamp(daysOverdue * 1.5, 0, 45)`, `+clamp(clientAvgDaysLate * 1.5, 0,
25)` — see `baseHistoryRisk()` and `scoreCollectionRisk()`, lines 106-190). These coefficients
(`1.5`, `45`, `25`, `10`, `12`, `6`, `8`...) are hand-picked, not fit to outcomes. Nothing checks
whether an invoice scored "70% likely to pay" actually pays ~70% of the time.

**Repo asset it builds on.** `client-payment-score.ts`'s `getClientOnTimePercent()` /
`getClientPaymentBehaviorSummaries()` compute a client's **historical** on-time rate from paid
`Invoice` + `Payment` rows — this is an *input* to the score, not the prediction being
calibrated. Confirmed by grep: there is **no** `RiskSnapshot`-style table or any other place a
`CollectionRiskScore` is persisted for later comparison against what actually happened
(`grep -rin "risksnapshot\|prediction" prisma/schema.prisma src/server/services` returns nothing).
This is the real gap: the measurement harness for this candidate does not exist yet, unlike
candidate #1.

**First 3 steps in this repo:**
1. Build the `ForecastSnapshot` analog for risk scores: a table (e.g. `CollectionRiskSnapshot`)
   that logs `invoiceId`, the scored `lateRiskPercent`/`paymentProbabilityPercent`, `scoredAt`,
   and stays open until the invoice reaches a terminal state (paid or written off).
2. Add a scoring pass (cron or on-demand backfill) that fills in the terminal outcome (`paidOnOrBeforeDue`
   boolean, or paid-at-all + days-late) once the invoice resolves.
3. Bucket scored predictions into deciles of `paymentProbabilityPercent` and compare each
   bucket's predicted rate to the realized on-time/paid rate in that bucket — a standard
   reliability/calibration table.

**Falsifiable milestone.** You have a result when, over a real cohort of resolved invoices
(not a fixture), each probability decile's realized rate falls within a stated band of its
predicted rate (e.g. "predicted 70-80% bucket realizes 65-85% actual" — pick and pre-register the
band width before measuring, per `lwd-research-methodology`). Until the snapshot table exists,
this candidate has no falsifiable milestone at all — say so rather than eyeballing `reasons[]`
strings as if they were evidence.

---

### 3. Dunning / collections-queue recovery optimization

**Why the current approach is limited.** `nextDunningAction()` in `dunning.ts` runs a fixed
retry ladder (`DUNNING_RETRY_OFFSETS_DAYS = [1, 3, 7]`, `dunning.ts:16`) regardless of the
specific failure reason's actual retry-success rate, and `scoreCollectionRisk`'s escalation
ladder (`rawRecommendation()`, lines 238-269) uses fixed day/band thresholds (`daysOverdue >= 30`,
`>= 8`, tone by band) rather than thresholds tuned to which action sequence actually recovers the
most money.

**Repo asset it builds on.** Real recovery data already exists in the DB: `PaymentAttempt` rows
(`kind` = `AUTOPAY` / `DUNNING_RETRY_1..3`, `status`, `processorError`) show which retries
succeeded; `Invoice.dunningEscalatedAt` marks terminal escalations; `Payment` rows show if/when
money eventually landed. **This is not currently aggregated into a recovery-rate metric anywhere
in the codebase** — it's raw operational data, not a research asset yet. Do not confuse this with
`src/test/ai-eval/collections-queue.eval.test.ts`: that suite (backed by
`collections-queue.fixtures.ts`, 3 hand-built cases) only asserts that `rankCollectionsQueue()`
sorts action-due-first / exposure-descending / tie-break-by-id correctly — it is a **pure sort-order
regression test**, not a recovery measurement, and touches no real dunning outcomes.

**First 3 steps in this repo:**
1. Write a query (new admin/ops script or a diagnostics endpoint, not a schema change) that joins
   `PaymentAttempt` → `Invoice` → `Payment` to compute, for a real historical window: recovery
   rate per `DUNNING_RETRY_*` kind, and days-to-recovery after each escalation action.
2. Establish the baseline number from that query — e.g. "X% of invoices that hit `DUNNING_RETRY_2`
   eventually get paid within 30 days" — before touching any code.
3. Propose one narrow policy change (e.g. adjust the retry offsets, or gate `final_notice` earlier
   for `severe` band) and re-run the same query after a full retry-ladder cycle has elapsed for the
   changed cohort.

**Falsifiable milestone.** You have a result when the new policy's measured recovery rate (real
`PaymentAttempt`/`Payment` outcomes, not the 3-case sort-order eval) is higher than the baseline's
on a comparable cohort, **and** every `critical: true` case in the AI eval suites still passes
(`npm run test:eval` — zero critical failures per `suite-gates.eval.test.ts`). A recovery win that
regresses a critical case is not a win; non-negotiable #4's critical-case veto is absolute. See
`money-intelligence-campaign` for how to run this as a full experiment (holdout cohort, rollout).

---

### 4. Benchmarking cohort intelligence

**Why the current approach is limited.** `benchmarking.ts` buckets orgs into 4 fixed
trailing-revenue bands (`REVENUE_BANDS`, lines 32-37: under $25k, $25k-$100k, $100k-$500k,
$500k+) and benchmarks only two metrics (`dso`, `percentOverdue`) via a simple `median()` +
`shareBeaten()` percentile. This is coarse — a two-employee consultancy and a five-employee
agency in the same revenue band may have very different DSO norms for reasons revenue alone
doesn't capture (industry, invoice frequency, contract type).

**Repo asset it builds on.** `benchmarking-data.ts`'s `getBenchmarksForOrg()` is the **one place
in the codebase that deliberately reads across all organizations** — the query at lines 106-119
has no `organizationId` filter, and the file's own header comment says so explicitly: "This is
the one place that reads receivables across *all* organizations — by design." **This is not a
violation of non-negotiable #1** — it's a documented, intentional exception, gated by two
invariants any new metric MUST preserve:
1. **k-anonymity**: `MIN_COHORT_SIZE = 5` (`benchmarking.ts:20`) — `buildBenchmarkResult()`
   refuses to return a benchmark (`available: false, reason: "insufficient_cohort"`) below that
   threshold.
2. **Aggregate-only output**: callers get their own value + cohort median + percentile + cohort
   size — never a peer list, never a peer id (`BenchmarkResult` type, lines 88-97).

Any new cohort metric is only a legitimate advance if it (a) is actually validated against real
production distributions across orgs, not just unit-tested with synthetic arrays like the current
`benchmarking.test.ts`-style coverage, and (b) never weakens either invariant above to get more
data points.

**First 3 steps in this repo:**
1. Pick one additional receivables metric with real analytics value (e.g. average days-to-first-
   payment, retainer utilization, invoice-to-payment lag) and add its pure math to `benchmarking.ts`
   the same way `dso`/`percentOverdue` are structured — a `metricBenchmark()`-shaped function.
2. Extend `computeOrgMetric()`/`aggregateOrgMetrics()` in `benchmarking-data.ts` to compute the new
   metric per org from real invoice/payment rows, preserving the existing revenue-band cohorting
   (or propose — and justify — a different cohort key, e.g. industry, if the data supports it).
3. Before shipping, pull the real cross-tenant distribution (via a one-off read-only script,
   never a mutating command) and sanity-check it isn't dominated by outlier orgs that would
   deanonymize a small cohort even above `MIN_COHORT_SIZE`.

**Falsifiable milestone.** You have a result when the new metric's cohort distribution, computed
from real production data, is validated as sane (e.g. median/percentile spread matches known
business reality, not skewed by a handful of orgs) **and** every returned benchmark still
satisfies `cohortSize >= MIN_COHORT_SIZE` and returns no per-org identifying values. A metric that
only "looks reasonable" on synthetic unit-test fixtures does not clear this bar.

---

## Common mistakes

- **Treating a passing unit test as validation.** `cash-flow-forecast.test.ts`-style coverage
  (pure functions, synthetic dates) proves the *code* is correct, not that a candidate model beats
  the baseline on real data. Only matured `ForecastSnapshot` rows / real `PaymentAttempt` outcomes
  count (non-negotiable #5).
- **Confusing `collections-queue.eval.test.ts` with a recovery metric.** It is a 3-case sort-order
  regression test for `rankCollectionsQueue()`. It has nothing to say about whether a dunning
  policy change recovers more money.
- **Proposing an LLM to compute any of these numbers.** Non-negotiable #3: money math is
  deterministic. If a candidate here ever involves a model, the model narrates or ranks — it never
  becomes the source of a dollar figure, and if it touches an LLM at all it needs a golden-set eval
  per non-negotiable #4 (see `lwd-validation-and-qa`).
- **Widening the benchmarking cross-tenant query "just to get more data."** The unscoped read in
  `getBenchmarksForOrg()` is a narrowly-scoped, documented exception. Loosening `MIN_COHORT_SIZE`
  or returning per-org rows to "make the feature better" defeats its entire privacy purpose.
- **Picking a margin/band after seeing the data.** Every milestone above says "state the margin
  before measuring." Post-hoc margins are how false positives get shipped as wins — see
  `lwd-research-methodology`.
- **Forgetting the retroactive-input trap for #1.** You cannot grade a new forecast model against
  old `ForecastSnapshot` rows because their inputs were never persisted. It must run prospectively
  from the day it's added.

## Provenance and maintenance

Verified 2026-07-05 against (all opened and read in full this session):
- `src/server/services/cash-flow-forecast.ts`
- `src/server/services/forecast-accuracy.ts`
- `src/server/services/client-payment-score.ts`
- `src/server/services/collection-risk.ts`
- `src/server/services/dunning.ts`
- `src/server/services/benchmarking.ts`
- `src/server/services/benchmarking-data.ts`
- `src/server/routers/analytics.ts` (forecastAccuracy procedure, org-scoping confirmed)
- `src/inngest/functions/forecast-snapshots.ts` (weekly cron, `0 5 * * 1`)
- `src/test/ai-eval/collections-queue.eval.test.ts` and
  `src/server/services/ai-eval/fixtures/collections-queue.fixtures.ts` and the
  `gradeCollectionsQueue` grader in `src/server/services/ai-eval/graders.ts`
- `src/test/ai-eval/suite-gates.eval.test.ts` (critical-case veto mechanics)
- `prisma/schema.prisma` (`ForecastSnapshot` model, ~line 380)
- `README.md` (AI & Analytics section)
- `package.json` (`test:eval` script)

Re-verification commands (run from repo root):
```bash
# Confirm the aging-weight table hasn't changed
grep -n "collectionProbabilityForAging" -A 8 src/server/services/cash-flow-forecast.ts

# Confirm no prediction-log table exists yet for collection-risk scores
grep -rin "risksnapshot\|prediction" prisma/schema.prisma src/server/services

# Confirm ForecastSnapshot still has no persisted-input column (the retroactive-eval trap)
grep -n "model ForecastSnapshot" -A 20 prisma/schema.prisma

# Confirm the collections eval is still sort-order-only (not a recovery metric)
wc -l src/server/services/ai-eval/fixtures/collections-queue.fixtures.ts
grep -n "gradeCollectionsQueue" -A 8 src/server/services/ai-eval/graders.ts

# Confirm the cross-tenant benchmarking read is still the sole unscoped query, still guarded
grep -n "MIN_COHORT_SIZE" src/server/services/benchmarking.ts
grep -n "organizationId" src/server/services/benchmarking-data.ts   # expect: none in getBenchmarksForOrg's query

# Confirm the weekly snapshot cron schedule
grep -n "cron:" src/inngest/functions/forecast-snapshots.ts

# Confirm the eval CI gate command still exists
grep -n "test:eval" package.json
```

Uncertainties: none of the four candidates' milestones can be exercised in the sandbox (no DB —
non-negotiable #5); all re-verification above is read-only grep against source, not a live-data
check. Anyone re-running this after schema or router changes should re-open the files above rather
than trust this document's line numbers.
