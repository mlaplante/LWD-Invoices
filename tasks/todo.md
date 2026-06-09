# TODO: Cash Flow & Money Intelligence

Plan: `tasks/plan.md` · Spec: `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`

## Phase 1 — Quick win + foundation
- [x] **T1** Invoice duplicate warning (#4) — `invoice-duplicate.ts` + 10 tests + `invoices.checkDuplicate` + `InvoiceForm` inline warning ✅ committed `0c2aed7`
- [x] **T2** Money Intelligence hub shell + `SidebarNav`/`MobileNav` entries + placeholder sections ✅ committed `d09e7e7`
- [x] **Checkpoint:** unit tests pass (10/10), `tsc --noEmit` clean, eslint clean. ⚠️ Full `npm run build` not runnable in sandbox (no DB; build script runs `prisma migrate deploy`); UI not runtime-verified. Awaiting human review before Phase 2.

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
