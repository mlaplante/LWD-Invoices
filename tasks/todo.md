# TODO: Cash Flow & Money Intelligence

Plan: `tasks/plan.md` · Spec: `docs/superpowers/specs/2026-06-09-cash-flow-money-intelligence-design.md`

## Phase 1 — Quick win + foundation
- [x] **T1** Invoice duplicate warning (#4) — `invoice-duplicate.ts` + 10 tests + `invoices.checkDuplicate` + `InvoiceForm` inline warning ✅ committed `0c2aed7`
- [x] **T2** Money Intelligence hub shell + `SidebarNav`/`MobileNav` entries + placeholder sections ✅ committed `d09e7e7`
- [x] **Checkpoint:** unit tests pass (10/10), `tsc --noEmit` clean, eslint clean. ⚠️ Full `npm run build` not runnable in sandbox (no DB; build script runs `prisma migrate deploy`); UI not runtime-verified. Awaiting human review before Phase 2.

## Phase 2 — Invoice intelligence (in-context)
- [x] **T3** Payment probability (#2) — extended `collection-risk.ts` + 5 tests + `analytics.paymentProbability` + row badge + `PaymentProbabilityPanel` ✅ `591d2c7`
- [x] **T4** Best day to send (#3) — `send-timing.ts` + 6 tests + `analytics.bestSendWindow` + send-dialog hint ✅ `664b8b0`
- [x] **Checkpoint:** full suite 1759 green, tsc clean, lint clean (pre-existing warnings only). UI not runtime-verified (no DB in sandbox).

## Phase 3 — Forecast intelligence (hub)
- [x] **T5** Scenario planner (#6) — contractor-hire + churn transforms + `applyScenarioPlan` + 5 tests + `analytics.cashFlowForecast` input + hub `ScenarioPlanner` ✅ `ab7a0df`
- [x] **T6** Runway/burn (#1) — `deriveRunway` + 6 tests + `analytics.runway` + hub `RunwaySection` (no fabricated days-of-cash) ✅ `822d587`
- [x] **Checkpoint:** full suite green, tsc + lint clean.

## Phase 4 — Profitability insights (hub)
- [x] **T7** Cash-margin insights (#5, Option 1) — `profitability-insights.ts` + 6 tests + `analytics.profitabilityInsights` + hub `ProfitabilitySection` linking existing report (existing report untouched) ✅ `d1c4a88`
- [x] **Checkpoint (Complete):** all 7 tasks shipped; full suite **1775 green**, tsc + lint clean.

## ⚠️ Verification ceiling (sandbox)
- No DB / `npm run build` not runnable here (build script runs `prisma migrate deploy`). All logic is unit-tested + type-checked; **UI not runtime-verified in a browser**. Recommend `npm run dev` against a local DB to confirm rendering of: invoice duplicate warning, payment-probability badge/panel, send-window hint, and the `/money-intelligence` hub (runway, scenario planner, profitability).
- Break-even-by-hours (#5) intentionally omitted — undefined under the own-time-free cash-margin decision.

## Independent / parallelizable
- T1 can start immediately. After T2, {T3,T4} and {T5,T6,T7} are independent — define each new `analytics.ts` procedure signature first.
