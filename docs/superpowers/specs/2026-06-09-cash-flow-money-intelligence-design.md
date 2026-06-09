# Cash Flow & Money Intelligence

**Date**: 2026-06-09
**Status**: Draft — pending user review

---

## Summary

A "Money Intelligence" initiative bundling six cash-flow / money-intelligence
features. Exploration revealed that **most of the underlying computation already
exists** in `src/server/services/*` and is exposed through `analytics.ts`. This
initiative is therefore primarily a **presentation + targeted-extension** effort:
a new hub page, a few in-context surfaces, and small additions to existing pure
services — not six new engines.

All four cross-cutting decisions (confirmed with the user):

1. **Runway** — reframe to net-position / burn (no bank-balance data stored).
2. **Profitability** — cash margin (own time free). See the cost-basis conflict
   flagged in Feature 5.
3. **Packaging** — a new "Money Intelligence" hub page **plus** in-context surfaces.
4. **Scoring** — deterministic pure functions; LLM used only as an optional,
   best-effort plain-English explainer, never to compute a score.

---

## What already exists (reality map)

Verified by reading the code, not assumed:

| Capability | Where | Relevance |
|---|---|---|
| Forward 30/60/90-day cash forecast + late-payment scenarios | `cash-flow-forecast.ts` → `analytics.cashFlowForecast` (accepts optional `startingCash` + `scenarios[]`) | #1 Runway, #6 Scenario planner |
| Per-invoice late-payment risk scoring using on-time history, overdue days, reminders sent, **and EmailEvent opens/clicks** | `collection-risk.ts` → `analytics.collectionsRisk` | #2 Payment probability |
| Client on-time % / reliable-payer | `client-payment-score.ts` | #2 |
| MRR/ARR/ARPA + revenue/logo **churn** | `subscription-metrics.ts` → `analytics.subscriptionMetrics` | #6 churn scenario |
| Duplicate-receipt + amount-outlier detection (the pattern to mirror) | `expense-anomaly.ts` → `analytics.expenseAnomalies` | #4 invoice duplicate |
| Profitability by client/project (margin, margin %) | `reports.profitabilityByClient` / `profitabilityByProject` + `/reports/profitability` page | #5 |
| Per-invoice email engagement timeline | `EmailEvent` (indexed by `invoiceId`) | #2, #3 |

**Implication:** the earlier idea of a brand-new `moneyIntelligence` tRPC router
is dropped. The natural home for new data procedures is **`analytics.ts`**, which
already owns forecasting, collections risk, churn, and anomalies. New UI lives
under a new hub route; in-context surfaces attach to existing invoice screens.

---

## Architecture

- **Services** (`src/server/services/*.ts`) — pure, testable functions hold all
  math, matching the existing `projectCashFlow` / `scoreCollectionRisk` pattern.
  - New: `send-timing.ts` (#3), `invoice-duplicate.ts` (#4), and a profitability
    **insights** helper (#5) that derives recommendations from margin rows.
  - Extend: `cash-flow-forecast.ts` (contractor-hire + churn scenarios, #6); a
    small `runway` summary built from the existing forecast (#1).
- **Router** — extend **`analytics.ts`** with new read procedures
  (`runway`, `paymentProbability` / reuse `collectionsRisk`, `bestSendWindow`,
  `profitabilityInsights`, `scenarioPlan`) and add an `invoices.checkDuplicate`
  procedure consumed by the create flow.
- **Hub page** — `src/app/(dashboard)/money-intelligence/page.tsx` with section
  components in `src/components/money-intelligence/`. Add one `SidebarNav` entry
  (`/money-intelligence`, label "Money Intelligence", a lucide icon e.g. `Brain`
  or `TrendingUp`).
- **In-context surfaces** — payment-probability badge on invoice rows + detail
  (#2); non-blocking duplicate warning inline in the invoice create form (#4);
  recommended send-window hint on the invoice/reminder send action (#3).
- **Scoring** — deterministic; LLM explainer reuses the existing
  Anthropic + `gemini-fallback` pattern and is best-effort (numeric result always
  renders even if the LLM call fails).
- **Precompute** — compute-on-read first (YAGNI). Add caching or an Inngest warm
  job only if a procedure proves slow over real history.

---

## Feature 1 — Runway (net position / burn)

**Existing:** `analytics.cashFlowForecast` already projects 30/60/90-day cash
movement. **Gap:** no burn-rate summary, no dedicated UI, and (by decision) no
stored bank balance — so no literal "days of cash."

**Plan:**
- Add a small `runway` derivation (in `cash-flow-forecast.ts` or a thin
  `runway.ts`) producing: **monthly burn** = recurring expenses + contractor
  outflows − recurring revenue; projected **net position at 30/60/90 days**;
  and a trajectory series for charting.
- Hub section: burn figure, net-position cards, trajectory chart (reuse the
  dashboard chart components in `src/components/dashboard/`).
- **Honest framing**: "Net −$X/mo at current burn", not a fabricated day count.
- *Future enhancement (out of scope):* `cashFlowForecast` already accepts an
  optional `startingCash`. A later opt-in manual-balance field would unlock the
  literal "days of cash" number with no engine changes.

## Feature 2 — Payment probability per invoice

**Existing:** `collection-risk.ts` already scores per-invoice late-payment risk
from client on-time history, overdue days, reminders sent, and EmailEvent
opens/clicks — exposed via `analytics.collectionsRisk`.

**Gap:** it's framed as a *dunning-risk/escalation* score, not a positive
"likelihood to pay" badge, and it does **not** yet factor in (a) invoice amount
vs. the client's typical amount, or (b) prior disputes.

**Plan:**
- Add the two missing signals (amount-vs-client-norm, prior dispute count) to
  `CollectionRiskInput` and `scoreCollectionRisk` as additional weighted factors.
- Derive a 0–100 **payment-probability** value (presentation inverse of risk)
  with a short contributing-factors list, reusing the existing reasons array.
- Surface: a colored badge on invoice rows and a factor breakdown on the invoice
  detail page. Replaces the aging-bucket-only view.
- Pure-function unit tests for the new signals and the probability mapping.

## Feature 3 — Best day to send

**Existing:** none. `EmailEvent` (opens/clicks, `occurredAt`, per client via
recipient/invoice) and payment timing provide the raw data.

**Plan:**
- New `send-timing.ts` pure function: per client, aggregate historical sends by
  weekday/time-window and correlate with fastest opens and fastest payment;
  return a recommended window + confidence.
- Fall back to a sensible global default (e.g. "Tue–Thu, morning") when a client
  lacks enough history (mirror the `MIN_INVOICES` guard in `client-payment-score`).
- Surface: a small recommendation on the invoice/reminder send action; optional
  per-client view in the hub.

## Feature 4 — Duplicate / anomaly warning

**Existing:** `expense-anomaly.ts` does exactly this shape for expenses. **Gap:**
nothing equivalent at invoice creation.

**Plan:**
- New `invoice-duplicate.ts` pure function mirroring the expense-anomaly pattern:
  flag existing invoices with **same client + amount within a tolerance + issued
  within a recent window** (tolerances configurable, sensible defaults).
- `invoices.checkDuplicate` procedure called by the create form; returns matches.
- Non-blocking inline warning with a link to the suspected duplicate.

## Feature 5 — Profitability (cash margin)

**Existing:** `reports.profitabilityByClient` / `profitabilityByProject` +
`/reports/profitability` already compute margin and margin %.

> **⚠️ Cost-basis conflict to resolve.** The existing report counts **your own
> tracked time at `project.rate` as a cost** (`hours × project.rate`). That
> contradicts the "cash margin / own time free" decision. Options:
> 1. **New cash-margin insight view** (recommended): leave the existing report
>    untouched (don't change numbers people already rely on); compute a separate
>    cash-margin basis = `revenue − expenses − contractor payments` for the
>    insights layer, clearly labeled as a different basis.
> 2. **Change the existing report** to exclude own-time. Simpler, one basis, but
>    silently changes existing reported margins.
>
> Spec assumes **Option 1** unless the user chooses otherwise at review.

**Note on contractor cost:** `ContractorPayment` has **no client/project link**
(only `contractorId`, optional `expenseId`). Contractor cost can be attributed to
a client/project **only** when the payment is linked to an `Expense` that carries
a `projectId`; otherwise it can be included at the org-level cash-margin total but
not attributed per client. This limitation will be stated in the UI.

**Plan:**
- New profitability-insights helper: read margin rows, compute the **median**
  margin %, and emit recommendations like "Client A's margin is 42% below your
  median." For projects with `projectedHours` / `isFlatRate`, add a break-even
  note ("profitable only while remaining hours stay under N").
- Surface in the hub; link to the existing `/reports/profitability` detail table.
- Optional LLM explainer phrases the recommendation; numbers stand alone.

## Feature 6 — Scenario planner

**Existing:** `cash-flow-forecast.ts` has `applyLatePaymentScenario`, exposed via
`analytics.cashFlowForecast` (`scenarios[]`). `subscription-metrics.ts` provides
the recurring-revenue book for churn.

**Gap:** only the late-payment scenario exists; contractor-hire and churn do not.

**Plan:**
- Extend `cash-flow-forecast.ts` with two new scenario transforms:
  - **Contractor-hire**: add a recurring outflow of `$rate/hr × hours/period`
    over the horizon.
  - **Revenue churn**: reduce recurring inflows (from the recurring-invoice book)
    by `Y%`.
- Extend the `analytics.cashFlowForecast` input to accept these scenario types
  alongside the existing late-payment one; re-run `projectCashFlow` and return the
  delta vs. baseline.
- Hub UI: scenario inputs (reuse the existing late-payment scenario UI if present)
  that show baseline-vs-scenario trajectories.
- Pure-function unit tests for each new transform.

---

## Sequencing

Ordered by leverage and independence; each ships on its own:

1. **#4 Duplicate warning** — smallest, self-contained, mirrors a known pattern.
2. **#2 Payment probability** — extend `collection-risk` + badge; high visibility.
3. **#6 Scenario planner** — extend the existing engine (contractor + churn).
4. **#1 Runway** — burn derivation + hub section over the existing forecast.
5. **#3 Best day to send** — new analysis; lower urgency.
6. **#5 Profitability insights** — after the cost-basis question is resolved.

The hub page (`/money-intelligence`) is scaffolded with #1/#5/#6 sections; #2/#3/#4
attach to existing invoice screens as they land.

---

## Testing

- Every new pure function gets unit tests (no DB), matching the existing
  `projectCashFlow` / `scoreCollectionRisk` test style.
- Router procedures get thin integration coverage where data-shaping is non-trivial
  (profitability insights, runway burn).
- LLM explainer paths are best-effort and must degrade to numeric-only output;
  tests assert the numeric result renders when the LLM call is stubbed to fail.

## Schema changes

**None anticipated.** All features read existing models. The only candidate future
field (optional manual cash balance for literal "days of cash") is explicitly out
of scope.

## Out of scope

- Bank integration / Plaid; stored cash balance.
- Adding a labor-cost rate to users/team (own time stays free).
- Rewriting the existing `/reports/profitability` cost basis (pending the
  Feature 5 decision).
