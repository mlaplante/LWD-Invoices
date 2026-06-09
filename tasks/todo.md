# TODO: Cash Flow & Money Intelligence

Plan: `tasks/plan.md` · Spec: `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`

## Phase 1 — Quick win + foundation
- [ ] **T1** Invoice duplicate warning (#4) — `invoice-duplicate.ts` + test + `invoices.checkDuplicate` + `InvoiceForm` inline warning
- [ ] **T2** Money Intelligence hub shell + `SidebarNav` entry + placeholder sections
- [ ] **Checkpoint:** `npm run test:run` + `npm run build` pass; duplicate warning + hub reachable; human review

## Phase 2 — Invoice intelligence (in-context)
- [ ] **T3** Payment probability (#2) — extend `collection-risk.ts` (amount-vs-norm + disputes) + tests + `analytics.paymentProbability` + row badge + detail breakdown
- [ ] **T4** Best day to send (#3) — `send-timing.ts` + test + `analytics.bestSendWindow` + send-action hint
- [ ] **Checkpoint:** tests + build pass; badge + hint visible on real invoices; human review

## Phase 3 — Forecast intelligence (hub)
- [ ] **T5** Scenario planner (#6) — `cash-flow-forecast.ts` contractor-hire + churn transforms + tests + `analytics.cashFlowForecast` input + hub `ScenarioPlanner`
- [ ] **T6** Runway/burn (#1) — `deriveRunway` + test + `analytics.runway` + hub `RunwaySection` (no fabricated days-of-cash)
- [ ] **Checkpoint:** tests + build pass; scenario + runway math correct on hub; human review

## Phase 4 — Profitability insights (hub)
- [ ] **T7** Cash-margin insights (#5, Option 1) — `profitability-insights.ts` + test + `analytics.profitabilityInsights` + hub `ProfitabilitySection` linking existing report (existing report untouched)
- [ ] **Checkpoint (Complete):** all acceptance criteria; full test + build clean; ready for `/code-review`

## Independent / parallelizable
- T1 can start immediately. After T2, {T3,T4} and {T5,T6,T7} are independent — define each new `analytics.ts` procedure signature first.
