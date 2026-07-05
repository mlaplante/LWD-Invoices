---
name: money-intelligence-campaign
description: Use when moving the needle on Money Intelligence accuracy — reducing cash-flow forecast BIAS, calibrating payment-probability/collection-risk scoring, or improving dunning/collections recovery, measured against matured ForecastSnapshot rows and the ai-eval golden suites (not a one-off bugfix). Triggers — forecastAccuracy/describeBias() reporting a persistent bias, the forecast called "too optimistic" / "runway looks wrong", the collections queue ranking oddly, or before editing cash-flow-forecast.ts, forecast-accuracy.ts, collection-risk.ts, dunning.ts, or benchmarking.ts. Not for domain-concept lookups (invoicing-domain-reference) or open-ended research without a target metric (lwd-research-frontier).
---

# Money Intelligence Accuracy Campaign

## Overview

Money Intelligence makes three promises to a user, and each is backed by its own
deterministic pure function, not a vibe:

1. **"Here's your cash position in 30/60/90 days"** — `projectCashFlow()` in
   `src/server/services/cash-flow-forecast.ts`.
2. **"Here's how likely this invoice is to get paid"** — `scoreCollectionRisk()`
   in `src/server/services/collection-risk.ts`.
3. **"Here's who to chase, and how hard"** — `rankCollectionsQueue()` (same file)
   and the dunning retry ladder in `src/server/services/dunning.ts`.

**The one number that matters for #1 is BIAS, not accuracy.** Accuracy (0–100)
tells you how close a forecast was; BIAS (`meanBiasPct`, a *signed* average error)
tells you which *direction* it's wrong and by how much — and direction is what a
user acts on. A forecast that's "70% accurate" but always over-promises cash is
more dangerous than one that's "70% accurate" in either direction randomly,
because a consistently over-promising forecast will eventually walk someone into
a cash crunch they thought they had runway for. **A persistent negative
`meanBiasPct` means: read projected cash conservatively, and this campaign's job
is to shrink that number toward zero, not to make `overallAccuracy` prettier.**

This skill is the only campaign for that number. It is intentionally narrow: a
single Money Intelligence question (bias/probability/recovery) run start to
finish — baseline, diagnose, fix with a stated theory, validate on held-out real
data, promote. It does not teach the domain (aging buckets, DSO, dunning
vocabulary — that's `invoicing-domain-reference`), open-ended exploration
(`lwd-research-frontier`), general experiment methodology
(`lwd-research-methodology`), or PR/merge mechanics (`lwd-change-control`) — it
routes through that gate at the end but doesn't restate it.

### Two separate probability models — do not conflate them

There are **two independent "how likely is this to get collected" models** in
this codebase. Confusing them is the single easiest mistake in this whole
campaign:

| | Feeds | Function | File |
|---|---|---|---|
| **Model A — forecast collection probability** | `ForecastSnapshot.projectedInflow` → BIAS | `collectionProbabilityForAging()` (a 5-bucket step function) + `AUTOPAY_PROBABILITY`/`RECURRING_INVOICE_PROBABILITY` constants | `cash-flow-forecast.ts` |
| **Model B — per-invoice payment/late risk** | the collections queue ranking, dunning escalation tone, and (per the design spec) a future "payment probability" badge | `scoreCollectionRisk()` (client history + overdue days + engagement + reminders + amount norm + disputes) | `collection-risk.ts` |

Tuning Model A's aging buckets does **not** change what the collections queue
shows, and tuning Model B's weights does **not** change `ForecastSnapshot`
accuracy or BIAS. Pick your target metric first (Phase 0), then work in exactly
one of these two files.

## When to use / when NOT to use

**Use this skill** when you are specifically trying to move BIAS, forecast
accuracy, payment-probability calibration, or dunning recovery, backed by real
matured data — i.e., you can point at a number before and after.

**Do NOT use this skill for:**
- Looking up what an invoice status, retainer, or 1099 field means → `invoicing-domain-reference`.
- A single unrelated bugfix that happens to touch one of these files (e.g. a
  type error in `dunning.ts`) → just fix it, no campaign needed.
- Open-ended "what could we build next in Money Intelligence" ideation with no
  target metric yet → `lwd-research-frontier`.
- Deciding *whether* a PR is safe to merge, what CI does/doesn't prove, or PR
  template mechanics → `lwd-change-control` (this skill's Phase 3 routes
  through it, but doesn't own it).
- General "how do I run a rigorous experiment" methodology → `lwd-research-methodology`.

---

## Phase 0 — Baseline (measure before touching anything)

**You cannot diagnose or validate a bias fix without a real number first.**
`analytics.forecastAccuracy` (in `src/server/routers/analytics.ts`) is
`protectedProcedure`-gated and reports **one org's** history only — there is no
built-in cross-org aggregate. This campaign needs the system-wide number, so use
the script shipped with this skill:

```bash
DIRECT_DATABASE_URL='<supabase session-pooler URL>' \
  npx tsx .claude/skills/money-intelligence-campaign/scripts/baseline-accuracy.ts
```

It connects read-only, pulls every `ForecastSnapshot` row with `scoredAt IS NOT
NULL` (i.e., matured and graded by the weekly cron), and runs the *exact* pure
grading functions the app uses (`summarizeAccuracy`, `scoreSnapshot` from
`src/server/services/forecast-accuracy.ts`) so its numbers are guaranteed
consistent with what the product would show.

**Expected output shape** (per horizon — 30/60/90 days — plus overall):
```
Total ForecastSnapshot rows: <n>
Matured (scored) rows: <n>
Still-pending (unmatured) rows: <n>
Overall accuracy (0-100, all horizons pooled): <n or n/a>
Per-horizon:
  horizon=30d  n=<n>  meanAccuracy=<0-100>  meanBiasPct=<signed %>  direction=<over-forecasting|under-forecasting|on-target>
  horizon=60d  ...
  horizon=90d  ...
```
`meanBiasPct < -5` → `over-forecasting` (you collect less than projected — the
dangerous direction). `meanBiasPct > 5` → `under-forecasting`. Between ±5 →
`on-target` (`BIAS_TOLERANCE_PCT` in `forecast-accuracy.ts`).

### Branch on sample size

The capture/score mechanics: `processForecastSnapshots`
(`src/inngest/functions/forecast-snapshots.ts`) runs **weekly, Monday 05:00 UTC**
(`cron: "0 5 * * 1"`). Each run (a) scores any snapshot whose `matureAt` has
passed, then (b) captures fresh 30/60/90-day snapshots for every org with open AR
or recurring revenue. A snapshot captured today doesn't *mature* — and can't be
scored — until `horizonDays` days later.

The `ForecastSnapshot` table was added in migration
`20260612000000_forecast_snapshots` (2026-06-12). **Candidate inference, not a
queried fact (re-run the script to confirm):** as of this writing (2026-07-05,
23 days after the migration, with 3 weekly cron runs having fired), even the
first 30-day-horizon snapshots captured on the first run (~2026-06-15) don't
mature until ~2026-07-15 — i.e. **the matured-snapshot count is likely still
near zero system-wide.** Do not skip running the script to check this.

| Branch | Condition | Action |
|---|---|---|
| **A — accumulate history first** | `scored.length < 30` (see `MIN_SAMPLES_FOR_SIGNAL` in the script — a generic heuristic, not a repo constant) | **Stop.** Do not diagnose or tune anything from noise. Confirm the pipeline itself is healthy instead: check the Inngest dashboard/logs for `process-forecast-snapshots` runs succeeding weekly, and that `captured` counts are non-zero and growing (`failures` should be 0 — see the function's return shape). Re-run the baseline script weekly until you clear the threshold. |
| **B — enough signal** | `scored.length >= 30` and per-horizon counts are non-trivial | Proceed to Phase 1. |

This is exactly the case where **sandbox-green ≠ done**: `npm run test:eval` and
`vitest` passing in a DB-less sandbox tells you nothing about real-world BIAS.
This phase requires a live DB connection.

---

## Phase 1 — Diagnose where the error comes from

Four candidate sources, each pinned to a specific constant or code path in
`cash-flow-forecast.ts`:

| # | Hypothesis | Constant(s) | What would confirm it |
|---|---|---|---|
| 1 | Aging-weight calibration is off | `collectionProbabilityForAging()`: 0.95 (not yet due), 0.90 (≤30d overdue), 0.75 (≤60d), 0.55 (≤90d), 0.35 (>90d) | Bias is present even when open-invoice inflow dominates the mix; bias magnitude tracks the aging distribution of open AR |
| 2 | Autopay assumption is wrong | `AUTOPAY_PROBABILITY = 0.97`, `AUTOPAY_SETTLE_DAYS = 3` | Bias shows up even for orgs whose recurring revenue is mostly autopay, at short horizons |
| 3 | Non-autopay recurring roll-forward is wrong | `RECURRING_INVOICE_PROBABILITY = 0.9`, `DEFAULT_PAYMENT_TERMS_DAYS = 14` (overridden per-client by `Client.defaultPaymentTermsDays`, wired in `buildCashFlowForecastInput` / `analytics-data.ts`) | Bias correlates with orgs that lean on recurring, non-autopay invoices |
| 4 | An open-invoice status filter silently drops OVERDUE invoices | `OPEN_STATUSES` in `analytics-data.ts` (currently `[SENT, PARTIALLY_PAID, OVERDUE]` — includes OVERDUE today) | **Historical precedent, re-verify before assuming it's fine:** `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` §3 caught the *separate* `reports.revenueForecast` procedure (`src/server/routers/reports.ts`) excluding `OVERDUE` from its own open-invoice query before merge. That code is fixed today, and `cash-flow-forecast.ts`'s own input builder already includes `OVERDUE` — but grep `OPEN_STATUSES` and any ad-hoc `status: { in: [...] }` filter you touch for a missing `OVERDUE` every time. |

### Known instrumentation gap — read before trying to attribute a specific snapshot's error

`ForecastSnapshot` stores only the **aggregate** `projectedInflow` /
`projectedOutflow` / `actualInflow` per horizon — it does **not** persist a
per-source breakdown (open-invoice vs. autopay vs. non-autopay recurring), and
it does not snapshot the underlying invoice/recurring-invoice rows used to build
it. `projectCashFlow()`'s own `inflows[]` array *does* tag each event with a
`source` and `probability`, but that detail is thrown away before it's written
to the DB. **You cannot retroactively decompose a historical snapshot's error
by source with 100% precision from stored data alone.**

Practical workaround (a triangulation heuristic, not a measurement):
1. Slice Phase 0's bias by horizon. Since open-invoice aging weighting affects
   all three horizons but autopay/short-term recurring inflows dominate the
   *early* portion of the 30-day window, a bias pattern that's flat across
   30/60/90d points more toward the aging curve (#1); a bias that's sharply
   worse at 30d than 60d/90d points more toward the autopay/recurring
   assumptions (#2/#3).
2. For a *forward-looking* check, re-run `projectCashFlow()` today against a
   live org's current `buildCashFlowForecastInput()` output and inspect the
   `inflows[]` array's `source` field directly — this tells you the *current*
   mix, not what a specific past snapshot's mix was.
3. **Candidate future improvement (not implemented, do not claim it exists):**
   persist a per-source breakdown on `ForecastSnapshot` (new nullable JSON
   column) so future diagnosis is exact instead of inferred. This is itself a
   schema change and goes through `lwd-change-control`'s migration gate.

---

## Phase 2 — Ranked solution menu

Every fix below **must** state, before you run anything: (a) the theory for why
it moves BIAS/accuracy/recovery, (b) the predicted direction and rough magnitude
(derived from Phase 0/1 data — e.g. "this bucket accounts for ~X% of projected
inflow, and its measured real collection rate is Y vs the coded Z, so BIAS should
move toward zero by roughly X% × (Z−Y)"), stated *before* you measure the
after-number. A theory you write after seeing the result isn't a theory.

### Track A — Cash-flow forecast BIAS (`cash-flow-forecast.ts`)

| Rank | Fix | Theory obligation | Wrong-path fence |
|---|---|---|---|
| 1 | Recalibrate `collectionProbabilityForAging()` bucket values from real aging→collection outcomes (highest leverage: touches every open invoice, every horizon) | State each bucket's share of total projected inflow (from Phase 1) and its measured real collection rate vs. the coded constant; predict the BIAS delta as share × (coded − measured) | Do not hand-tune off a handful of eyeballed invoices/orgs; derive the new constant from an aggregate query over real paid-vs-overdue outcomes across many orgs |
| 2 | Recalibrate `AUTOPAY_PROBABILITY` / `AUTOPAY_SETTLE_DAYS` | State measured actual autopay settle-rate and lag vs. 0.97 / 3 days; predict effect scaled by autopay's share of recurring revenue (`subscription-metrics.ts` has the recurring-revenue book) | Same as above — real aggregate data, not anecdote |
| 3 | Recalibrate `RECURRING_INVOICE_PROBABILITY` / effective terms for non-autopay recurring invoices | State measured actual settle-rate for non-autopay recurring invoices vs. 0.9 / net-terms assumption | Don't conflate "terms" with "when clients actually pay" — that's exactly the gap being measured |
| 4 (instrumentation, not a fix) | Add a per-source breakdown field to `ForecastSnapshot` so Phase 1 becomes exact | This doesn't move BIAS by itself — it makes the *next* round of diagnosis precise. Schema change → `lwd-change-control` migration gate | Don't ship this instead of a real fix and call the campaign done |

### Track B — Payment-probability / collections ranking (`collection-risk.ts`, `dunning.ts`)

| Rank | Fix | Theory obligation | Wrong-path fence |
|---|---|---|---|
| 1 (prerequisite) | Add a numeric golden-set grader for `scoreCollectionRisk()`'s output (risk %, band, recommended action) — **verified gap:** the only existing eval, `src/test/ai-eval/collections-queue.eval.test.ts` / `collections-queue.fixtures.ts` (3 fixtures), pins `rankCollectionsQueue()`'s *ordering* over pre-baked `CollectionRiskScore` objects; it never exercises `scoreCollectionRisk()`'s own weights at all | Without this you have no regression guard on the weights you're about to tune — a silent weight change could regress dunning tone/escalation with nothing catching it | Don't count the 3 existing ordering fixtures as coverage for weight tuning — they aren't |
| 2 | Tune `scoreCollectionRisk()`'s weight constants (overdue-pressure slope, engagement deltas, reminder-fatigue, amount-vs-norm, prior-disputes) against real days-late outcomes | State which weight, its current clamp/coefficient, and the measured real correlation strength that justifies changing it | Don't overfit to 3 fixtures or one org's history; don't let an LLM propose the new numeric weights — a human derives and commits them as plain constants, same as today |
| 3 | Build a **dunning recovery-rate metric** before optimizing `DUNNING_RETRY_OFFSETS_DAYS = [1, 3, 7]` — **verified gap:** `Invoice.dunningEscalatedAt` exists in the schema but no query/service currently aggregates "% of escalated invoices that eventually got paid, and how fast" | This is instrumentation, like Track A rank 4 — required before rank 3 becomes measurable, not a fix by itself | Don't tune the retry schedule "because it feels slow" without this number |

### Cross-cutting wrong paths (apply to both tracks)

- **Never let an LLM compute or rank the number.** Confirmed by the design doc
  (`docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`):
  "Scoring: deterministic pure functions; LLM used only as an optional,
  best-effort plain-English explainer, never to compute a score." This mirrors
  non-negotiable #3 (financial math is deterministic) — an LLM may narrate
  `describeBias()`'s output, never produce it.
- **Don't conflate Model A and Model B** (see Overview) — confirm which file
  and which metric you're moving before writing a line of code.
- **Don't fix the test instead of the bug.** `src/test/cash-flow-forecast.test.ts`
  pins `collectionProbabilityForAging()`'s exact current values
  (`-5 → 0.95`, `20 → 0.9`, `45 → 0.75`, `80 → 0.55`, `120 → 0.35`). If you
  change the constants, you *must* update this test — but only after Phase 3
  validates the new constants against real data. Editing the test to match new
  numbers you haven't validated is how a wrong calibration ships silently.
- **Don't skip the OVERDUE check** (Phase 1, hypothesis #4) on any status filter
  you touch or add.

---

## Phase 3 — Validate and promote

1. **Re-run the baseline script** (Phase 0) after the change, on the same
   underlying data plus whatever new matured snapshots have accumulated since.
   Compare `meanBiasPct` and `meanAccuracy` per horizon, before vs. after.
2. **Hold out data you calibrated on.** If you derived a new constant from
   snapshots captured before date X, validate against snapshots captured *after*
   X (or a set of orgs excluded from calibration) — never validate on the exact
   rows you tuned against.
3. **Update the pinned unit tests** to the new constants:
   `src/test/cash-flow-forecast.test.ts` (Track A),
   `src/test/collection-risk.test.ts` (Track B). Run:
   ```bash
   npx vitest run src/test/cash-flow-forecast.test.ts src/test/forecast-accuracy.test.ts src/test/collection-risk.test.ts
   ```
4. **Extend the eval suite.** If you touched Track B, add the numeric grader
   from Phase 2 rank 1 (a new `Grader<Input, Expected>` in
   `src/server/services/ai-eval/graders.ts` + a fixtures file under
   `src/server/services/ai-eval/fixtures/`, wired into
   `runAllEvalSuites()` in `src/server/services/ai-eval/index.ts` with an
   explicit gate — the existing suites all use `{ minScore: 1, minPassRate: 1 }`
   or `{ minScore: 0.95, minPassRate: 1 }`; pick deliberately, don't default to
   the loosest one). Run:
   ```bash
   npm run test:eval
   ```
5. **Success is measured, never eyeballed:** the PR must state, in the
   description, the before/after `meanBiasPct` and `meanAccuracy` per horizon
   from step 1, and the hypothesis from Phase 2 that predicted the direction —
   confirm the actual delta matches the predicted direction before claiming
   success. A BIAS number that moved the *wrong* way, or didn't move outside
   noise, means the theory was wrong — go back to Phase 1, don't rationalize it.
6. **Route the PR through `lwd-change-control`** for the standard gates
   (org-scoping review if you touched a router, migration review if you added
   the ForecastSnapshot breakdown column, CI gates). This skill does not
   restate those gates.

---

## Common mistakes

- Treating `overallAccuracy` as the headline number instead of `meanBiasPct` —
  a forecast can be "accurate on average" while consistently erring in the
  dangerous (over-promising) direction; `describeBias()` exists precisely to
  surface the signed number.
- Diagnosing or promoting a change from `analytics.forecastAccuracy`'s per-org
  view alone — it's one org's sample, not the campaign's baseline.
- Assuming `collection-risk.ts` feeds the cash-flow forecast (it doesn't — see
  the two-models table in Overview).
- Declaring the collections-queue eval "covers" `scoreCollectionRisk()` — it
  only covers `rankCollectionsQueue()`'s ordering over pre-baked scores.
- Calling a change done because `vitest`/`tsc` are green in the sandbox — this
  campaign's unit of truth is real matured `ForecastSnapshot` rows, which
  requires a DB connection the sandbox does not have (non-negotiable #5).
- Forgetting the weekly cadence: a config/constant change made today does not
  produce a new matured snapshot to validate against for at least
  `horizonDays` days after the *next* Monday 05:00 UTC capture run.

---

## Provenance and maintenance

Verified 2026-07-05 against the files below (open each again before trusting a
number here — this document warns its own author's category of authoring pass
hallucinates file:line references, per `docs/reviews/AUDIT-2026-05.md`).

**Files read in full:**
- `src/server/services/cash-flow-forecast.ts` — `projectCashFlow`, `collectionProbabilityForAging`, constants, scenario transforms.
- `src/server/services/forecast-accuracy.ts` — `scoreSnapshot`, `summarizeAccuracy`, `describeBias`, `BIAS_TOLERANCE_PCT`.
- `src/server/services/cash-flow-insights.ts` — backward-looking trends; LLM narrative never computes numbers.
- `src/server/services/benchmarking.ts` — k-anonymity (`MIN_COHORT_SIZE = 5`), revenue bands.
- `src/server/services/client-payment-score.ts` — `MIN_INVOICES = 3`, `getClientOnTimePercent`, `isReliablePayer`.
- `src/server/services/collection-risk.ts` — `scoreCollectionRisk`, `rankCollectionsQueue`, `recommendAction`.
- `src/server/services/dunning.ts` — `nextDunningAction`, `DUNNING_RETRY_OFFSETS_DAYS = [1, 3, 7]`.
- `src/inngest/functions/forecast-snapshots.ts` — `processForecastSnapshots`, cron `"0 5 * * 1"`, score-then-capture logic.
- `src/server/routers/analytics.ts` — `cashFlowForecast`, `forecastAccuracy` (per-org, uncached), `collectionsRisk`, `profitabilityInsights`, `runway` procedures.
- `src/server/services/analytics-data.ts` — `OPEN_STATUSES = [SENT, PARTIALLY_PAID, OVERDUE]`, `buildCashFlowForecastInput`.
- `prisma/schema.prisma` — `ForecastSnapshot` model (lines ~380–400).
- `prisma/migrations/20260612000000_forecast_snapshots/migration.sql` — exact column names/types.
- `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md` — Money Intelligence design decisions (deterministic scoring, LLM-explainer-only rule, two-models distinction implied by the reality map).
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` — the OVERDUE-exclusion near-miss in `reports.revenueForecast` (a sibling function, not `cash-flow-forecast.ts`).
- `src/server/services/ai-eval/index.ts`, `graders.ts`, `types.ts`, `fixtures/collections-queue.fixtures.ts`, `src/test/ai-eval/collections-queue.eval.test.ts`, `src/test/ai-eval/suite-gates.eval.test.ts` — eval gate shape and the ranking-only coverage gap.
- `src/test/cash-flow-forecast.test.ts`, `src/test/forecast-accuracy.test.ts` — confirmed exact pinned constant values.
- `package.json` — `test:eval` script, `pg`/`tsx` dependencies.
- `vitest.config.mts` — `environment: "node"`, `@` alias.

**Re-verify anything that may have drifted:**
```bash
# Confirm the aging buckets / autopay / recurring constants haven't changed:
rtk proxy grep -n "AUTOPAY_PROBABILITY\|RECURRING_INVOICE_PROBABILITY\|DEFAULT_PAYMENT_TERMS_DAYS\|collectionProbabilityForAging" -A3 src/server/services/cash-flow-forecast.ts

# Confirm OPEN_STATUSES still includes OVERDUE:
rtk proxy grep -n "OPEN_STATUSES" -A5 src/server/services/analytics-data.ts

# Confirm the cron schedule hasn't moved:
rtk proxy grep -n "cron:" src/inngest/functions/forecast-snapshots.ts

# Confirm the eval gate for collections-queue and whether a numeric grader
# for scoreCollectionRisk has since been added:
rtk proxy grep -n "collections-queue\|gradeCollectionsQueue\|gradeCollectionRisk" src/server/services/ai-eval/index.ts

# Re-run the actual baseline (requires a real DB connection):
DIRECT_DATABASE_URL='<url>' npx tsx .claude/skills/money-intelligence-campaign/scripts/baseline-accuracy.ts
```

If your shell doesn't have the `rtk` wrapper, drop the `rtk proxy` prefix and
run plain `grep`.
