---
name: lwd-research-methodology
description: Use when a hunch, forecast tweak, perf idea, or "this might be wrong" observation needs to become an ACCEPTED change instead of vibes — before trusting your own root-cause story, before claiming a fix or optimization "works," when writing up a docs/reviews/*.md finding, when deciding whether an idea needs a flag/branch to isolate it, or when deciding whether to adopt or retire something you prototyped. Also load this when two numbers in the app disagree (e.g. two tabs showing different totals) and you need a bar for what counts as a real explanation, or when reviewing an AUDIT/perf-pass doc and judging whether its findings are measured or merely reasoned.
---

# LWD Research Methodology

## Overview

The core principle: **an explanation is not accepted because it sounds right — it
is accepted because it predicted a number in advance, then survived someone
trying to break it.** This project is a multi-tenant money system; "I think this
is why" is not a deliverable. A hypothesis becomes a fact here only after it
clears two bars:

1. **The evidence bar** — one mechanism explains *every* observation, including
   the negative ones (why it didn't fail before, why it only fails for org B and
   not org A), and it survives someone actively trying to refute it.
2. **The predict-first bar** — for anything with a number attached (a forecast, a
   perf claim, a query count, a recovery rate), you write the predicted number
   *before* you run the change. A prediction that matches is evidence. A number
   you computed after seeing the result and then explained is not — it's a story.

Everything below is how those two bars get applied in this repo, and the
five places (verified, not folklore) where good ideas have actually come from
here.

## When to use / When NOT to use

Use this skill when you're about to:
- Write up a `docs/reviews/*.md` finding and want to know what "done" looks like.
- Decide if a fix explains the bug, or just makes the symptom go away.
- Ship a forecast/perf/AI change and need to know what number to write down first.
- Decide whether an idea needs isolating (flag, provider pin, branch) before it's
  safe to try, and what happens to it if it doesn't pan out.

Do NOT use this skill for (go to the sibling that owns it instead):
- The mechanics of the AI golden-set harness (graders, fixtures, gate math) —
  that's `lwd-validation-and-qa`; this skill only says evals are the required
  ground truth for AI claims, not how to write one.
- Actually running a profiler, an index check, or `tsc`/`test:coverage` — that's
  `lwd-diagnostics-and-tooling`.
- Concrete proof recipes / repro scripts for a specific claim — that's
  `lwd-proof-and-analysis-toolkit`.
- "What should we build next" / the live feature backlog — that's
  `lwd-research-frontier`. This skill uses old backlog docs as *evidence the
  process works*; frontier uses them as *the menu*.
- "Is this stale branch worth merging or should I delete it" — that's
  `lwd-failure-archaeology`'s call, not this skill's.
- Which gate (migration review, org-scoping check, eval requirement) a change
  must clear before merge — that's `lwd-change-control`.
- Isolating a change behind an env var / provider pin — the *mechanics* of that
  are `lwd-config-and-flags`; this skill only tells you *when* isolation is
  required in the idea lifecycle.

## The evidence bar, in practice

A one-mechanism explanation must account for the whole shape of the evidence,
not just the headline symptom. Two verified examples from this repo's own
review history:

- **The negative case, not just the positive one.** `docs/reviews/AUDIT-2026-05.md`
  names this exact failure mode in its own methodology note: multiple review
  passes are AI agents, and "the agents *do* hallucinate occasionally... agents
  may report behaviour that was already fixed in recent commits as if it were
  still broken." A root-cause story that doesn't explain *why the code currently
  passes its tests* is incomplete — it's explaining a bug that may not exist.
- **One mechanism, multiple disagreeing observations.** `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`
  finding #2: the client-profitability tab and the project-profitability tab
  showed different revenue for the same org because `profitabilityByProject`
  summed `InvoiceLine.total` (pre-payment) while `profitabilityByClient` summed
  actual `Payment` amounts. The correct write-up doesn't stop at "project tab is
  wrong" — it has to explain *why the two tabs disagree at all* (different
  revenue-recognition method) before the fix is trustworthy. A fix that patches
  the number without naming the mechanism will regress the next time someone
  touches either procedure.

**Adversarial refutation** is not optional for anything non-trivial. The
cheapest version in this repo is the audit's own method: assign a second
pass (a person or another agent) whose only job is to try to break the
explanation — find the counter-example, the org where it doesn't hold, the
test that already covers this. `AUDIT-2026-05.md`'s "five parallel passes"
(security / code-quality / performance / architecture / frontend) is that
method institutionalized. Do the small version of it yourself: before you
call a diagnosis done, spend one pass explicitly trying to disprove it.

## The predict-first bar, in practice

Write the number down before you run anything. Two real shapes this takes here:

**1. Forecast accuracy grades itself against reality — the model to copy.**
`src/inngest/functions/forecast-snapshots.ts` runs weekly (Monday 5am UTC): it
freezes `ForecastSnapshot` rows for 30/60/90-day horizons (`projectedInflow`,
per `prisma/schema.prisma`'s `ForecastSnapshot` model), and separately fills in
`actualInflow` once a horizon matures, from real payments received. `src/server/services/forecast-accuracy.ts`
then scores each matured snapshot and rolls them up into a **signed BIAS
percentage** (`meanBiasPct` / `describeBias()`): negative means the forecast
over-promises cash, positive means it under-promises. This is the reference
example: the prediction (`projectedInflow`) is recorded *before* the outcome is
known, and the grading is a fixed, pre-defined formula — nobody eyeballs it
after the fact and decides if it "seems close."

Use this shape for any new forecasting feature: capture the prediction, capture
the actual, compute error with a formula fixed in advance, don't let "was it
close enough" be a judgment call made after seeing both numbers.

**2. Perf claims: write the predicted delta, then mark it unmeasured until
proven.** `docs/reviews/2026-06-24-performance-tuning-pass.md` is the
project's own template for this — read its "Verification ceiling" section
first. It states plainly: *"Every finding below is reasoned and type-checked
(tsc clean), not measured... The 'measure first' rule applies — these are
candidates, ranked by structural risk, not proven regressions."* Every finding
still gets a predicted number written down before anyone touches a profiler,
e.g.:
- Recurring-invoice generation: "10-line invoice, two taxes per line: 30
  round-trips → 2."
- Retention check-in cron: "500-org tenant goes from N×t to ⌈N/10⌉×t."

Those are falsifiable claims made *before* measurement — exactly what a
profiler run can later confirm or refute. Compare that to the tickets
pagination note in the same doc: *"the `tickets` 'Load more' interaction is
type-checked + unit-tested at the procedure layer but **not
runtime-verified**"* — the doc is explicit about which claims still lack their
number. Never upgrade a reasoned candidate to a proven win in a write-up
without that measurement — see `lwd-diagnostics-and-tooling` and
`lwd-proof-and-analysis-toolkit` for how to actually take the measurement, and
the project's verification ceiling (`tasks/todo.md`: no DB / `npm run build`
not runnable in the sandbox) for why "sandbox green" alone can never be that
measurement.

## The idea lifecycle

| Stage | What happens | Where it's governed |
|---|---|---|
| 1. Hypothesis + predicted number | Write down what you expect to observe, in a number, before changing code. Applies to forecasts, perf, AI-output quality, recovery rates — anything with a metric. | This skill |
| 2. Isolate | Land the change so it can be evaluated or reverted without collateral damage. In this repo that's a provider-pin env var for AI changes (e.g. `*_AI_PROVIDER` in `src/lib/env.ts` — `ASSISTANT_AI_PROVIDER`, `REMINDER_AI_PROVIDER`, `RECEIPT_OCR_PROVIDER`, `INVOICE_PARSER_PROVIDER`, `INVOICE_REVIEW_AI_PROVIDER`), a config default, or — when there's no flag mechanism for the surface area — an unmerged branch as the isolation boundary. There is no generic app-wide feature-flag framework here; don't assume one exists for non-AI changes. | `lwd-config-and-flags` (mechanics) |
| 3. Measure against real data + the eval harness | Never the sandbox alone. For AI-touching changes, `npm run test:eval` against the golden set is mandatory (non-negotiable #4); for perf/forecast changes, measure against a real DB/real org data, not tsc + unit tests. | `lwd-validation-and-qa`, `lwd-diagnostics-and-tooling` |
| 4a. Adopt | Route through the applicable merge gates and write down what shipped and why, in `docs/reviews/` or a spec, with the before/after number. | `lwd-change-control` |
| 4b. Retire | Write down *why it failed* so the next person (or agent) doesn't re-propose it blind. A retirement with no write-up is a re-litigated argument waiting to happen. | feeds `lwd-failure-archaeology` |

**A retirement without a write-up is a trap, not a saving of time.** Verified
example at the "no write-up" end of the spectrum: commit `fa7e75e`
("`fix(reports): make tax dashboard cash-basis throughout (remove misleading
basis toggle)`") deleted a basis-toggle UI that had shipped and turned out to
be misleading. That's a real retirement, but it lives only as a commit
message — there's no `docs/reviews/` note explaining *why* the toggle was
misleading. Don't repeat that gap: when you retire something, put the "why"
in a doc, not just a terse commit subject, so `lwd-failure-archaeology` has
something to find later.

**An idea surviving retirement can still re-enter through a different door.**
Verified sequence: branch `claude/kind-noether-15or6e` (unmerged, diverged from
`main` at `d453b3a`) contains standalone commits for dunning/failed-payment
recovery, PWA support, and ACH/SEPA payments. It was never merged. Later,
commit `a72623a` — *"Add dunning (failed-payment recovery) system with PWA
support (#66)"* — shipped the same feature pair through the normal PR pipeline
on `main`. Treat this as: **shipped later via #66**, not "derived from" the
branch — there's no evidence of a direct cherry-pick or read-through, only that
the same idea reached acceptance through the front door on a second attempt.
The lesson: an unmerged branch is a legitimate way to isolate/shelve an idea
(stage 2) without it being lost — it doesn't have to be merged to eventually
be adopted, but it does have to go back through stages 3–4 for real, not be
merged wholesale because "it already existed."

## Where good ideas have historically come from here (verified sources)

| Source | What it produces | Verified example |
|---|---|---|
| Structured audit passes | A roadmap of severity-ranked findings, explicit about which were fixed vs. left as candidates | `docs/reviews/AUDIT-2026-05.md` — 5 parallel passes, "What changed in this PR" vs. "Roadmap" sections |
| Targeted code reviews | Feature-scoped correctness findings, often financial-math bugs | `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` — the missing-`organizationId` and payments-vs-line-totals findings |
| Perf tuning passes | Structural-risk-ranked, explicitly unmeasured candidates | `docs/reviews/2026-06-24-performance-tuning-pass.md` |
| Feature-gap brainstorms | A surveyed backlog of things the product doesn't do yet, cross-referenced against existing roadmap items instead of re-pitching them | `docs/reviews/2026-06-10-feature-gap-brainstorm.md` (owned in more depth by `lwd-research-frontier`) |
| Abandoned/parallel branches | Ideas that didn't merge but can resurface through the normal pipeline later | `origin/claude/kind-noether-15or6e` → later shipped via `#66` (see above) |

Anchor any new idea to one of these five, or name a new source explicitly —
don't invent a provenance story that isn't in the git/docs history.

## Common mistakes

- **Treating "tsc clean + unit tests green" as proof of a DB-touching or
  perf claim.** The perf-tuning pass is explicit that this sandbox cannot run
  `npm run build` (it shells out to `prisma migrate deploy` first) or reach a
  real DB — see the project's verification ceiling. Reasoned-but-unmeasured
  is a valid, honest state to ship a write-up in; "measured" is not, unless
  you actually ran it against real data.
- **Post-hoc rationalization dressed as a prediction.** If you already ran the
  change and then wrote a number that matches what you saw, that is not
  evidence — write predictions in a place/order that makes the "before" timestamp
  checkable (a commit made before the measurement commit, a comment landed
  before the profiler run).
- **A fix that only explains the positive case.** If your root-cause story
  can't say why the bug *didn't* happen everywhere it could have (why org A is
  fine, why the test suite didn't catch it, why it worked "yesterday"), you
  don't have the mechanism yet — you have a plausible-sounding patch.
- **Silent retirement.** Killing an approach without writing down why (see
  `fa7e75e` above) means someone re-proposes it in six months with no memory
  that it was already tried and rejected.
- **Treating an unmerged branch as adopted because "it basically already
  exists."** Isolation (stage 2) is not adoption (stage 4a) — a shelved branch
  still has to clear measurement and change-control gates on its own merits
  when it resurfaces, even if the idea is old.
- **Confusing "candidate" with "roadmap-approved."** Both `AUDIT-2026-05.md`
  and the perf pass explicitly separate "what changed in this PR" from "what's
  merely listed as a roadmap item" — a finding appearing in a doc is not the
  same as it being accepted or scheduled.

## Provenance and maintenance

Date: 2026-07-05.

Files opened and verified for this skill:
- `docs/reviews/AUDIT-2026-05.md` (full read)
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md` (full read)
- `docs/reviews/2026-06-24-performance-tuning-pass.md` (full read)
- `tasks/todo.md` (full read, verification-ceiling block)
- `docs/reviews/2026-06-10-feature-gap-brainstorm.md` (partial read, via `git show 671b0da:...`)
- `src/server/services/forecast-accuracy.ts` (full read)
- `src/inngest/functions/forecast-snapshots.ts` (header/doc comment + grep for `projectedInflow`/`actualInflow`/`horizonDays`)
- `prisma/schema.prisma` (grep for `ForecastSnapshot`)
- `src/lib/env.ts` (grep for `*_AI_PROVIDER` vars)
- `.github/workflows/ci.yml` (full read, confirms `test:coverage` — not a separate `test:eval` step — runs in CI)
- `vitest.config.mts` (confirms no exclude for `src/test/ai-eval`, so eval suites run under `test:coverage`)
- `src/test/ai-eval/suite-gates.eval.test.ts` (full read — confirms the "no critical failures" + score/pass-rate gate mechanism)
- `CONTRIBUTING.md` (grep for the 3-bucket error-handling rule)
- `netlify.toml` (grep for `migrate deploy`)
- git history: `git branch -a` / `git for-each-ref refs/remotes` / `git log <sha> --oneline` /
  `git merge-base` / `git merge-base --is-ancestor` to establish `claude/kind-noether-15or6e`
  diverged from `main` at `d453b3a` and was never merged; `git log origin/main --oneline | grep dunning`
  to confirm `a72623a` (#66) shipped the same feature pair later; `git show fa7e75e --stat` to confirm
  the basis-toggle removal is a commit-only retirement with no accompanying doc.

Re-verification commands (run from repo root):
```bash
# Confirm the eval suite still runs inside the CI-gated test command (not skipped):
grep -n "test:coverage\|test:eval" package.json
grep -n "exclude" vitest.config.mts

# Confirm the forecast self-grading loop is still wired end to end:
grep -n "projectedInflow\|actualInflow\|horizonDays" src/inngest/functions/forecast-snapshots.ts
grep -n "meanBiasPct\|describeBias" src/server/services/forecast-accuracy.ts

# Confirm kind-noether is still unmerged (should NOT print "YES ancestor"):
git merge-base --is-ancestor origin/claude/kind-noether-15or6e origin/main && echo "YES ancestor (re-check this skill's framing)" || echo "still unmerged, as documented"

# Re-scan for a provider-pin var before claiming the isolation list is current:
grep -n "_AI_PROVIDER" src/lib/env.ts

# Re-check whether a generic feature-flag framework has since been added (currently: none found):
grep -rn "FEATURE_\|ENABLE_" src/lib/env.ts
```

Uncertainties / candidates (labeled, not asserted as fact):
- Whether commit `a72623a` (#66) directly reused any code from
  `claude/kind-noether-15or6e`, or was an independent reimplementation, is
  **not verified** — only the sequence (branch diverged and sat unmerged,
  feature later shipped via a numbered PR) is confirmed. Framed above as
  "shipped later via #66," not "derived from."
- Whether `docs/reviews/2026-06-10-feature-gap-brainstorm.md` items have since
  moved to accepted/rejected status is out of this skill's scope — check
  `lwd-research-frontier` for the current state of that backlog.
