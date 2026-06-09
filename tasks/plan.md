# Implementation Plan: Cash Flow & Money Intelligence

**Spec:** `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`
**Date:** 2026-06-09
**Status:** Draft — pending human review

## Overview

Deliver six money-intelligence features as **vertical slices** over the
*existing* analytics engines. Most computation already lives in
`src/server/services/*` and is exposed via `src/server/routers/analytics.ts`;
this plan adds a hub page, a few in-context surfaces, and targeted extensions to
existing pure services. No schema changes.

## Architecture Decisions

- **New procedures go into `analytics.ts`**, not a new router — that file already
  owns forecasting, collections risk, churn, and anomalies.
- **Pure functions hold the math**, tested without a DB in `src/test/*.test.ts`,
  matching `expense-anomaly.test.ts` / collection-risk style.
- **Feature 5 = Option 1**: a *new* cash-margin insight basis
  (`revenue − expenses − contractor payments`, own time free). The existing
  `/reports/profitability` report is left untouched.
- **Deterministic scoring**; LLM explainer is best-effort and never blocks the
  numeric result.
- **Hub** at `src/app/(dashboard)/money-intelligence/`, one `SidebarNav` entry,
  section components under `src/components/money-intelligence/`.
- **Compute-on-read first** (YAGNI); add caching/Inngest only if a procedure is
  slow over real history.

## Dependency Graph

```
analytics.ts (existing engines) ──────────────────────────────┐
  │                                                            │
  ├── invoice-duplicate.ts ──── invoices.checkDuplicate ── InvoiceForm (T1)
  │
  ├── money-intelligence hub shell + nav (T2) ──┐ (home for T5,T6,T7 sections)
  │                                             │
  ├── collection-risk.ts (extend) ── analytics.paymentProbability ── invoice badge + detail (T3)
  │
  ├── send-timing.ts ──── analytics.bestSendWindow ──── send-action hint (T4)
  │
  ├── cash-flow-forecast.ts (extend: contractor+churn) ── analytics.cashFlowForecast(input) ── hub scenario UI (T5)
  │
  ├── cash-flow-forecast.ts (runway/burn derivation) ── analytics.runway ── hub runway section (T6)
  │
  └── profitability-insights.ts ── analytics.profitabilityInsights ── hub profitability section (T7)
```

Build order follows leverage + independence; each task leaves the system working.

---

## Task List

### Phase 1 — Quick win + foundation

#### Task 1: Invoice duplicate warning (#4)
**Description:** New pure detector mirroring `expense-anomaly.ts` that flags an
in-progress invoice as a likely duplicate of an existing one (same client +
amount within tolerance + issued within a recent window). Wire a tRPC check and
show a non-blocking inline warning in the invoice create form.

**Acceptance criteria:**
- [ ] `detectInvoiceDuplicate(candidate, recentInvoices, opts)` pure function returns matches with reasons + a tolerance/window config (sensible defaults).
- [ ] `invoices.checkDuplicate` procedure returns suspected duplicates for the current org + entered client/amount.
- [ ] `InvoiceForm` shows a dismissible warning with a link to the suspected duplicate when one exists; never blocks submission.

**Verification:**
- [ ] Tests pass: `npm run test:run -- invoice-duplicate`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: create an invoice matching a recent one → warning appears with link; tweak amount beyond tolerance → warning clears.

**Dependencies:** None
**Files likely touched:** `src/server/services/invoice-duplicate.ts`, `src/test/invoice-duplicate.test.ts`, `src/server/routers/invoices.ts`, `src/components/invoices/InvoiceForm.tsx`
**Estimated scope:** M

#### Task 2: Money Intelligence hub shell + nav
**Description:** Scaffold the hub route and a sidebar entry with placeholder
sections (Runway, Scenario planner, Profitability) that later tasks fill in.

**Acceptance criteria:**
- [ ] `/money-intelligence` route renders with titled placeholder section cards.
- [ ] `SidebarNav` has a "Money Intelligence" entry (lucide icon, e.g. `TrendingUp`) routing there.
- [ ] Page guards/access match the other `(dashboard)` pages.

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Manual: nav entry appears and routes; sections render as labeled placeholders.

**Dependencies:** None
**Files likely touched:** `src/app/(dashboard)/money-intelligence/page.tsx`, `src/components/money-intelligence/*` (placeholders), `src/components/layout/SidebarNav.tsx`
**Estimated scope:** S

### Checkpoint: Foundation (after T1–T2)
- [ ] `npm run test:run` and `npm run build` pass.
- [ ] Duplicate warning works end-to-end; hub route + nav reachable.
- [ ] Review with human before proceeding.

---

### Phase 2 — Invoice intelligence (in-context)

#### Task 3: Payment probability per invoice (#2)
**Description:** Extend `collection-risk.ts` with two new signals (invoice amount
vs. client norm; prior dispute count), derive a 0–100 payment-probability
(presentation inverse of risk) with a factors list, expose it, and surface a
badge on invoice rows + a breakdown on the detail page.

**Acceptance criteria:**
- [ ] `CollectionRiskInput` + `scoreCollectionRisk` incorporate amount-vs-norm and prior-dispute signals with unit tests for each.
- [ ] `analytics.paymentProbability` returns per-open-invoice probability + contributing factors (reuses the input builder).
- [ ] Invoice rows show a colored probability badge; invoice detail shows a factor breakdown (reuse `EmailEngagementPanel` layout patterns).

**Verification:**
- [ ] Tests pass: `npm run test:run -- collection-risk`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: an overdue, never-opened, large invoice scores low; a clicked-link reliable-payer invoice scores high.

**Dependencies:** None (analytics engine exists)
**Files likely touched:** `src/server/services/collection-risk.ts`, `src/test/collection-risk.test.ts`, `src/server/routers/analytics.ts`, `src/components/invoices/InvoiceTableWithBulk.tsx`, `src/app/(dashboard)/invoices/[id]/page.tsx`
**Estimated scope:** M

#### Task 4: Best day to send (#3)
**Description:** New `send-timing.ts` pure function: per client, correlate
historical `EmailEvent` opens + payment speed by weekday/time-window; recommend a
send window with confidence and a global fallback when history is thin. Surface a
hint on the send/reminder action.

**Acceptance criteria:**
- [ ] `recommendSendWindow(history, opts)` returns a window + confidence, with a `MIN_*` guard that falls back to a global default.
- [ ] `analytics.bestSendWindow` returns the recommendation for a given client/invoice.
- [ ] `SendInvoiceButton` / reminder action shows the recommended window (non-blocking hint).

**Verification:**
- [ ] Tests pass: `npm run test:run -- send-timing`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: a client whose opens cluster on Tue mornings yields that recommendation; a new client yields the default.

**Dependencies:** None
**Files likely touched:** `src/server/services/send-timing.ts`, `src/test/send-timing.test.ts`, `src/server/routers/analytics.ts`, `src/components/invoices/SendInvoiceButton.tsx`
**Estimated scope:** M

### Checkpoint: Invoice intelligence (after T3–T4)
- [ ] Tests + build pass.
- [ ] Probability badge + send-window hint visible on real invoices.
- [ ] Review with human before proceeding.

---

### Phase 3 — Forecast intelligence (hub)

#### Task 5: Scenario planner extensions (#6)
**Description:** Extend `cash-flow-forecast.ts` with contractor-hire (recurring
outflow = rate × hours/period) and revenue-churn (reduce recurring inflows by Y%)
transforms; extend the `analytics.cashFlowForecast` scenario input to accept
them; build the hub scenario UI showing baseline vs. scenario.

**Acceptance criteria:**
- [ ] `applyContractorHireScenario` and `applyChurnScenario` pure transforms with unit tests proving the delta vs. baseline.
- [ ] `analytics.cashFlowForecast` accepts the new scenario types alongside the existing late-payment one.
- [ ] Hub scenario section: inputs for late-pay / contractor-hire / churn, rendering baseline-vs-scenario trajectories.

**Verification:**
- [ ] Tests pass: `npm run test:run -- cash-flow-forecast`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: adding a $85/hr contractor lowers the 90-day net position by the expected amount.

**Dependencies:** Task 2 (hub shell)
**Files likely touched:** `src/server/services/cash-flow-forecast.ts`, `src/test/cash-flow-forecast.test.ts`, `src/server/routers/analytics.ts`, `src/components/money-intelligence/ScenarioPlanner.tsx`
**Estimated scope:** M

#### Task 6: Runway / burn section (#1)
**Description:** Add a burn-rate + net-position derivation over the existing
forecast (no stored balance) and a hub section that charts the trajectory with
honest framing ("net −$X/mo at current burn").

**Acceptance criteria:**
- [ ] `deriveRunway(forecast)` returns monthly burn + net position at 30/60/90 days + trajectory series, unit-tested.
- [ ] `analytics.runway` exposes it for the current org.
- [ ] Hub runway section renders cards + trajectory chart (reuse dashboard chart components); no fabricated "days of cash".

**Verification:**
- [ ] Tests pass: `npm run test:run -- runway`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: burn figure matches recurring expenses + contractor outflows − recurring revenue.

**Dependencies:** Task 2 (hub shell)
**Files likely touched:** `src/server/services/cash-flow-forecast.ts` (or `runway.ts`), `src/test/runway.test.ts`, `src/server/routers/analytics.ts`, `src/components/money-intelligence/RunwaySection.tsx`
**Estimated scope:** M

### Checkpoint: Forecast intelligence (after T5–T6)
- [ ] Tests + build pass.
- [ ] Scenario planner + runway render on the hub with correct math.
- [ ] Review with human before proceeding.

---

### Phase 4 — Profitability insights (hub)

#### Task 7: Cash-margin profitability insights (#5, Option 1)
**Description:** New insights helper computing a **cash-margin** basis
(`revenue − expenses − contractor payments`, own time free) per client/project,
the median margin %, and recommendations ("Client A is 42% below your median";
break-even note for `projectedHours`/`isFlatRate` projects). Surface on the hub,
linking to the existing `/reports/profitability` table. Existing report untouched.

**Acceptance criteria:**
- [ ] `buildProfitabilityInsights(rows)` computes median + deviation recommendations + break-even notes, unit-tested.
- [ ] `analytics.profitabilityInsights` returns cash-margin rows + recommendations; contractor cost attributed per-client only when tied to a project expense, else org-level (labeled).
- [ ] Hub profitability section shows top recommendations and links to `/reports/profitability`; optional LLM explainer degrades to numeric-only.

**Verification:**
- [ ] Tests pass: `npm run test:run -- profitability-insights`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: a low-margin client surfaces the deviation recommendation; existing `/reports/profitability` numbers are unchanged.

**Dependencies:** Task 2 (hub shell)
**Files likely touched:** `src/server/services/profitability-insights.ts`, `src/test/profitability-insights.test.ts`, `src/server/routers/analytics.ts`, `src/components/money-intelligence/ProfitabilitySection.tsx`
**Estimated scope:** M

### Checkpoint: Complete (after T7)
- [ ] All acceptance criteria met; `npm run test:run` + `npm run build` clean.
- [ ] Hub shows Runway + Scenario + Profitability; invoices show probability badge, duplicate warning, send-window hint.
- [ ] Ready for review / `/code-review`.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Profitability cost-basis confusion (existing report uses time@rate; new view uses cash margin) | High | Keep bases separate + clearly labeled (Option 1); don't touch existing report. |
| Contractor cost not attributable per client (no client/project FK) | Med | Attribute only via linked project expense; show org-level otherwise, stated in UI. |
| Probability "score" misread as a guarantee | Med | Present as a band + factors, not a promise; reuse existing reasons copy. |
| Send-timing over-fits thin history | Med | `MIN_*` guard + global default; show confidence. |
| Forecast/runway perf over large orgs | Low | Compute-on-read first; add caching/Inngest only if measured slow. |

## Open Questions

- Feature 5 basis confirmed as **Option 1** (per user). Re-confirm at review.
- Icon choice for the nav entry (`TrendingUp` vs `Brain`) — cosmetic, pick at impl.

## Parallelization

- After T2, Tasks **3, 4** (invoice in-context) and **5, 6, 7** (hub sections)
  are largely independent and can be parallelized; they share `analytics.ts` —
  define each new procedure's signature first to avoid merge churn.
- T1 is fully independent and can start immediately.
