---
name: invoicing-domain-reference
description: Use when reading, writing, or reviewing code that touches invoicing/accounting/tax domain models (Invoice, InvoiceLine, Payment, PartialPayment, Retainer, HoursRetainer, Contractor/ContractorPayment, Dispute, Refund, CreditNoteApplication, Tax, Milestone, PeriodClose) or their enums (InvoiceType, InvoiceStatus, LineType, W9Status, DisputeStatus, RefundStatus). Also when a task mentions invoice lifecycle/status transitions, partial payments vs. actual payments, proposals/estimates, retainer drawdown, 1099/W9 compliance, dunning/collections, AR aging, DSO, credit notes, or compound tax vs. Stripe Tax — or "what does this field/status/model mean". Not for forecast math (money-intelligence-campaign) or layer/routing structure (lwd-architecture-contract).
---

# Invoicing & Accounting Domain Reference

## Overview

This skill is the static domain map for LWD Invoices' financial models: what each
model/enum/status means, how the invoice lifecycle actually moves, and where the
line between "what money is owed" and "what money has actually arrived" is drawn.
It teaches domain concepts (accounting/tax theory as they are implemented here),
not forecasting formulas and not layering/architecture rules.

**The one thing to internalize before touching any of this code:**

> An invoice's cached `total`/`subtotal`/`taxTotal` fields describe what is
> **owed**. What has actually been **collected** is derived by summing `Payment`
> rows, never by reading line totals, `PartialPayment` records, or invoice
> status as a proxy for cash received. This is non-negotiable #3 in the
> project's engineering rules — an LLM narrates this money, it never computes it.

Verified pattern, used identically in `src/server/services/ar-reports.ts`
(`outstandingAsOf`) and `src/server/services/analytics-data.ts` (multiple sites):

```ts
// balance = invoice.total (Decimal) − sum of related Payment.amount rows
const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
const balance = Math.max(0, Number(invoice.total) - paid);
```

## When to use / When NOT to use

Use this skill when you need to know **what a domain concept means here** before
changing code: invoice status semantics, what "partial payment" actually is,
how a retainer drawdown is capped, what makes a contractor 1099-eligible, what a
credit note's lifecycle is, etc.

Do **NOT** use this skill for:
- **Forecasting math** (30/60/90-day cash projection, collection-probability
  weighting, MRR/ARR, forecast accuracy grading) → see `money-intelligence-campaign`.
- **Layer/routing structure** (which router calls which service, tRPC context
  shape, `protectedProcedure`/`requireRole`) → see `lwd-architecture-contract`.
- **Org-scoping security review of a diff** → see `lwd-security-and-secrets`.
- **Build/env/migration mechanics** → see `lwd-build-and-env`.
- **Debugging a live incident** → see `lwd-debugging-playbook` /
  `lwd-failure-archaeology`.
- **Test/QA process** → see `lwd-validation-and-qa`.
- **Feature flags / org settings knobs** → see `lwd-config-and-flags`.

## The invoice type × status matrix

`InvoiceType` (prisma/schema.prisma:28) and `InvoiceStatus` (line 36) are
orthogonal — the same status enum is reused across very different documents:

| InvoiceType | What it really is | Distinguishing fields |
|---|---|---|
| `SIMPLE` | Single-amount invoice, no line items | `simpleAmount` set, `lines` empty |
| `DETAILED` | Normal multi-line invoice | `lines[]` drive `subtotal`/`taxTotal`/`total` |
| `ESTIMATE` | A quote/proposal awaiting client accept/reject | Uses `signedAt`/`signedByName`/`signatureData`; statuses `ACCEPTED`/`REJECTED` only make sense here |
| `CREDIT_NOTE` | A negative-value document issued against a prior invoice | `sourceInvoiceId` set, `creditNoteStatus` (`DRAFT`\|`ISSUED`\|`APPLIED`\|`VOIDED`, a plain `String?`, **not** a Prisma enum) drives its own lifecycle independent of `InvoiceStatus` |
| `DEPOSIT` | Funds the client's general prepaid-credit pool (`Client.creditBalance`) — **not** the `Retainer` model | On `markPaid` / full payment, `Client.creditBalance` is incremented by `invoice.total` (`src/server/routers/invoices.ts` ~lines 1148, 1383) instead of just flipping status |

`InvoiceStatus` values (schema.prisma:36-44): `DRAFT`, `SENT`,
`PARTIALLY_PAID`, `PAID`, `OVERDUE`, `ACCEPTED`, `REJECTED`. `ACCEPTED`/
`REJECTED` are estimate-only outcomes (client accept/reject in the portal);
they never apply to `SIMPLE`/`DETAILED` invoices. `OVERDUE` is set by a daily
cron (`processOverdueInvoices`, `src/inngest/functions/overdue-invoices.ts`,
`0 7 * * *` UTC): any `SENT`/`PARTIALLY_PAID` `SIMPLE`/`DETAILED` invoice past
its `dueDate` flips to `OVERDUE` — unless it has an unpaid `PartialPayment`
installment whose own `dueDate` hasn't arrived yet, in which case it's
skipped. The same cron self-heals the reverse case (an `OVERDUE` installment
invoice whose next installment isn't due yet reverts to `PARTIALLY_PAID`).
Not terminal — paying it still moves it to `PAID`/`PARTIALLY_PAID` through
the normal payment paths.

**Estimates ARE proposals.** There is no separate "Proposal" model. A
"Proposal" is an `ESTIMATE`-type `Invoice` plus its 1:1 `ProposalContent`
(keyed by `ProposalContent.invoiceId`, `@unique`). The portal token, the PDF
route (`/api/invoices/[id]/proposal-pdf`), `EmailEvent` attribution, and the
"viewed but not signed" nudge cron all key off that same `invoiceId` — there is
deliberately no independent proposal identity. See
`docs/superpowers/specs/2026-06-09-proposals-section-ai-wizard-design.md`.
Cross-check any proposal-shaped change against that constraint before adding a
second way to identify a proposal.

## Money flow: Payment vs. PartialPayment (read this before touching either)

These two models are easy to conflate. They are not interchangeable:

| Model | What it is | Feeds balance calculations? |
|---|---|---|
| `Payment` | An actual money-received record (amount, method, gatewayFee, transactionId, paidAt) | **Yes** — this is the only table AR aging (`ar-reports.ts`), DSO, and analytics sum to compute what's actually collected |
| `PartialPayment` | A **planned installment** on a payment schedule (amount or `isPercentage`, `dueDate`, `isPaid` flag) — think "3 installments of $500 due monthly," not a ledger of money received | **No** — `payments` (the `Payment` relation) is what every reporting/aging helper reads; `partialPayments` is read only by the invoice UI, receipt emails, and the pay-page/autopay flow to know what to charge next |

Verified in `src/server/services/ar-reports.ts` (`fetchReceivables` selects
`payments`, never `partialPayments`) and `src/server/services/analytics-data.ts`
(same pattern, multiple call sites).

**A real divergence to know about, not to "fix" without checking history/tests
first:** when the client pays an installment online, the Stripe webhook
(`src/app/api/webhooks/stripe/route.ts`, ~line 274) creates a `Payment` row
**and** flips `PartialPayment.isPaid`. But the admin-facing manual mutation
`invoices.recordPartialPayment` (`src/server/routers/invoices.ts` ~line 1415)
only flips `PartialPayment.isPaid` / recomputes `InvoiceStatus` — it does
**not** insert a matching `Payment` row. So a manually-marked installment can
move the invoice to `PARTIALLY_PAID`/`PAID` while AR aging (which only sums
`Payment`) still shows the full balance outstanding. If you touch either path,
verify which behavior the tests around it currently pin before assuming one is
"the bug."

`resolvePartialPaymentAmount()` (`src/server/services/partial-payments.ts`) is
the single source of truth for converting an installment's `amount` +
`isPercentage` into a concrete currency figure — six call sites used to
duplicate this; don't reintroduce a seventh copy.

`markPaid` (full payment, `invoices.ts` ~line 1343) is the simple case: one
`Payment` row, `InvoiceStatus.PAID`, done in a `$transaction`.

## Tax resolution: two mutually-exclusive paths

An org uses **one** of two tax engines, switched by
`Organization.stripeTaxEnabled` (schema.prisma:236):

| Path | Off (default) | On |
|---|---|---|
| Engine | Legacy compound-tax calculator, `src/server/services/tax-calculator.ts` — an exact port of the legacy PHP app's `rows_with_tax_total()` algorithm | Stripe Tax Calculation API (needs a Stripe gateway + complete org origin address) |
| Per-line result stored in | `InvoiceLineTax` (one row per line × tax) | `InvoiceLineStripeTaxBreakdown` (jurisdiction-level rows, e.g. state + county + city) |
| Compounding | Non-compound taxes apply to the discounted subtotal independently; compound taxes apply **in order**, each on the running total so far | Handled by Stripe, not visible in app code |

A given invoice line uses one path or the other, never both — this is set at
calc time, not stored per-line. `Client.isTaxExempt` short-circuits both paths
to a `0` taxTotal with a "Tax exempt" line, checked before either engine runs.

`stripeTaxCalculationId` is set when Stripe computed the tax; it is later
promoted to `stripeTaxTransactionId` at payment finalization (needed to issue
a reversal if a credit note is later generated against the invoice).

## Retainers: monetary vs. hours (two different models, same word)

| | `Retainer` (+ `RetainerTransaction`) | `HoursRetainer` (+ `HoursRetainerPeriod`) |
|---|---|---|
| Unit | Money (`balance: Decimal`) | Hours (`includedHours: Decimal`) |
| Cardinality | One per client (`@unique([clientId, organizationId])`) | Many per client (named packages, e.g. "10hr/mo support") |
| Reset | Never — a running balance drawn down over time | Optionally `resetInterval: MONTHLY` — burns down within a `HoursRetainerPeriod` window (`periodStart`/`periodEnd`, `includedHoursSnapshot`), then a fresh period starts |
| Drives | Invoice `retainerApplied` field, set via `retainers.applyToInvoice` | `TimeEntry.retainerId` / `retainerPeriodId` — logged hours consume the period's included hours before hitting `hourlyRate` overage |
| Drawdown cap logic | `calculateDrawdownAmount()` in `src/server/services/retainers.ts`: `min(retainerBalance, invoiceTotal - invoicePaid - retainerAlreadyApplied)` — never draws more than what's actually left owing | N/A — hours either fit the period's remaining balance or overflow to billable overage |

`RetainerTransaction.type` is a free-form string (`"deposit"` \| `"drawdown"`
\| `"refund"`), not a Prisma enum — don't assume exhaustive-enum safety when
switching on it.

**Three separate "the client has credit" mechanisms — do not conflate them:**

1. `Retainer.balance` — the dedicated retainer model above, funded only via
   `retainers.deposit` (`src/server/routers/retainers.ts`) with its own
   `RetainerTransaction` ledger and `calculateDrawdownAmount()` cap.
2. `Client.creditBalance` — a separate general prepaid-credit pool. Funded by
   paying a `DEPOSIT`-type invoice (see the type table above). Consumed via
   the `applyCreditBalance` input at invoice-creation time, which sets
   `Invoice.creditApplied` and decrements `Client.creditBalance`
   (`src/server/routers/invoices.ts` ~lines 536–565) — auto-marking the
   invoice `PAID` if the credit fully covers it.
3. `CreditNoteApplication` — the amount of a specific `CREDIT_NOTE` invoice
   applied to a specific target invoice (see "Credit notes" below). Unrelated
   to both of the above.

None of these three write to each other's balance field. If you're asked to
"apply credit" to an invoice, confirm which of the three the request means
before touching code.

## Milestone billing

`Milestone` (schema.prisma:1002) belongs to a `Project`, has an optional
`amount`, and an optional 1:1 `invoiceId` (`@unique`) when `autoInvoice` is
true — completing the milestone (`completedAt` set) can generate its own
invoice. This is project-scoped billing, distinct from the client-level
`Retainer`/`HoursRetainer` above.

## 1099 / W-9 contractor compliance

`Contractor` = a payee (not a `User`/`Client`). Key fields (schema.prisma:1301):

- `w9Status`: `NOT_REQUESTED` → `REQUESTED` → `RECEIVED` (`W9Status` enum).
- `tinType`: `SSN` \| `EIN` (`ContractorTinType`); `tinEncrypted` is AES-GCM
  ciphertext at rest, `tinLast4` is the only cleartext piece kept for display.
- `exemptFrom1099`: corporations (C/S) are generally exempt — set manually,
  excludes the payee from the pack regardless of amount paid.

`ContractorPayment.method` (`ContractorPaymentMethod` enum: `CHECK`, `ACH`,
`WIRE`, `CASH`, `CARD`, `THIRD_PARTY`, `OTHER`) drives the default
`reportable` flag: `CARD`/`THIRD_PARTY` payments default to **not**
reportable, because the payment processor already reports them to the IRS on
a 1099-K — including them here would double-report the same income.

`get1099Pack()` (`src/server/services/contractor-1099.ts`) computes, per
contractor, per calendar year: `total` = sum of `ContractorPayment.amount`
where `reportable=true` in `[Jan 1, Jan 1 next year)`. A row is `eligible` when
`total >= NEC_1099_THRESHOLD` (**$600**, the IRS 1099-NEC box-1 threshold) AND
`!exempt`. `missingW9` = eligible but `w9Status !== "RECEIVED"` — this is the
signal that blocks accurate filing, surfaced in the UI before download.

## Dunning / collections (failed-payment recovery)

`nextDunningAction()` (`src/server/services/dunning.ts`) is a pure state
machine over `PaymentAttempt` rows for one invoice:

1. Any `SUCCEEDED` attempt → `NONE` (money landed).
2. No initial `AUTOPAY` `FAILED` attempt → `NONE` (nothing to recover).
3. A `DUNNING_RETRY_*` attempt still `PENDING` → `WAIT` (crash-safety: don't
   double-fire while a prior retry is unresolved).
4. Non-retryable failure (`isRetryableFailure()` — no customer/payment method
   on file, expired card, gateway disabled) → `ESCALATE` immediately.
5. Otherwise retry on a **1 / 3 / 7 day** schedule after the initial failure
   (`DUNNING_RETRY_OFFSETS_DAYS`), up to 3 retries, then `ESCALATE`.
6. `ESCALATE` sets `Invoice.dunningEscalatedAt` — terminal; the cron skips
   escalated invoices forever after.

Retry idempotency rides on `PaymentAttempt`'s `@@unique([invoiceId, kind])` —
each retry slot (`DUNNING_RETRY_1`/`_2`/`_3`) is its own `kind`, so a
duplicated cron run can never double-charge (`PaymentAttempt.idempotencyKey`
is a second, independent unique guard on top of that).

## AR aging & DSO (point-in-time reporting, not forecasting)

`src/server/services/ar-reports.ts` is the source of truth for two reports:

- **AR aging** (`getArAgingAsOf`): every non-archived `SIMPLE`/`DETAILED`
  invoice that has left `DRAFT`, bucketed by `daysBetween(asOf, dueDate)` into
  `current` / `d1_30` / `d31_60` / `d61_90` / `d90plus`
  (`bucketForDaysPastDue()`). Balance per invoice is `outstandingAsOf()` —
  gross `total` minus `Payment.amount` rows with `paidAt <= asOf`, floored at
  zero. Point-in-time by construction: works for "now" and for a past
  fiscal year-end alike.
- **DSO trend** (`getDsoTrend`): for each of the trailing N month-ends,
  reconstructs AR-at-that-instant and trailing-365-day sales, then
  `computeDso(ar, trailingSales) = ar / (trailingSales / 365)`. A 365-day
  sales window (not single-month) keeps the metric stable across sparse
  billing months.

Both share one `react cache()`-wrapped `fetchReceivables()` fetch per request
so rendering both reports together doesn't double-scan the org's invoices.

This is descriptive reporting on data that already happened — it does not
project forward. For 30/60/90-day cash-flow forecasting, collection
probability, forecast accuracy grading, MRR/ARR, or peer DSO benchmarking, see
`money-intelligence-campaign`.

## Credit notes

A `CREDIT_NOTE`-type `Invoice` is created against a `sourceInvoiceId`, moving
through its own `creditNoteStatus` lifecycle (a `String?`, not an enum —
verified in `src/server/routers/creditNotes.ts`): `DRAFT` → `ISSUED` → (later)
`APPLIED`, or `ISSUED`/`DRAFT` → `VOIDED`. `CreditNoteApplication` records the
actual amount applied from a credit note to a target invoice
(`creditNoteId`/`invoiceId` pair) — a credit note can be partially applied, so
its issued amount and its applied amount are tracked separately.

## Cash vs. accrual, currency, and other cross-cutting notes

- **Revenue and tax reporting are cash-basis.** `revenueByMonth` and the
  revenue side of `profitLoss` (`src/server/routers/reports.ts`) group by
  `Payment.paidAt`, not `Invoice.date`/`dueDate` — revenue is recognized when
  collected. `EstimatedTaxPayment`/`estimated-tax.ts` are explicit about this
  ("cash basis, calendar-year filer"). Note `profitLoss`'s expense side groups
  by `Expense.createdAt` instead, so don't assume every number on that one
  report shares the same basis — verify the specific query before asserting
  "this report is cash-basis" as a blanket claim.
- **Multi-currency**: `Currency.exchangeRate` is per-org, and each `Invoice`
  snapshots its own `exchangeRate` at creation — changing an org's currency
  rate later does not retroactively change historical invoice totals.
- **Money precision**: line/invoice amounts are `Decimal(20,10)` in Postgres
  (high precision for intermediate math); reporting/display code converts to
  `Number` and rounds with a local `round2()` (`Math.round(n*100)/100`) helper
  — re-declared per-file (e.g. `early-payment-discount.ts`,
  `expense-budgets.ts`, `forecast-accuracy.ts`, `tax-calculator.ts`), not
  imported from one shared module. Don't assume a single canonical `round2`
  export exists.
- **Early-payment discounts** ("2/10 net 30" style): the offer
  (`earlyPayDiscountPercent`/`Days`) is snapshotted onto the invoice at
  creation from the org default, so changing the org setting later doesn't
  retroactively change an already-issued invoice's offer. Redemption is
  applied **post-tax** as an appended `FIXED_DISCOUNT` line, validated
  server-side at checkout (never trust a client-submitted discount amount).
- **Disputes vs. Refunds**: a `Dispute` (schema.prisma:1951, mirrors a Stripe
  chargeback) and a `Refund` (schema.prisma:1999) are separate models, both
  tied to a `Payment` + `Invoice`. The app never auto-mutates the source
  invoice when a dispute opens — a dispute can still be won and the charge
  re-collected, so `Invoice.status` isn't flipped defensively.
- **Month-end close**: `PeriodClose` (schema.prisma:2156) is one row per
  `(organizationId, periodYear, periodMonth)`, freezing a full reconciliation
  `snapshot` (JSON) at close time. A period is "locked" iff a `CLOSED` row
  exists; `REOPENED` preserves the old snapshot rather than deleting it.

## Concept → schema/service quick-reference table

| Term | Meaning here | Where it lives |
|---|---|---|
| Invoice lifecycle | DRAFT → SENT → (PARTIALLY_PAID) → PAID, or → OVERDUE, or (estimate) → ACCEPTED/REJECTED | `Invoice.status` (`InvoiceStatus`), `src/server/routers/invoices.ts` |
| Line types | STANDARD, TIME_ENTRY, FLAT_RATE, EXPENSE, PERCENTAGE_DISCOUNT, FIXED_DISCOUNT, PERIOD_DAY/WEEK/MONTH/YEAR | `LineType` enum, schema.prisma:46 |
| Actual money received | Sum of `Payment.amount` | `Payment` model; `ar-reports.ts`, `analytics-data.ts` |
| Planned installment schedule | `PartialPayment` rows (amount/%, dueDate, isPaid) — NOT itself money received | `PartialPayment`; `partial-payments.ts` |
| Auto-charge attempt (success/fail) | `PaymentAttempt` with `idempotencyKey` and `@@unique([invoiceId, kind])` | `PaymentAttempt`, `PaymentAttemptStatus` |
| Proposal | An `ESTIMATE` Invoice + 1:1 `ProposalContent` | `ProposalContent.invoiceId @unique` |
| Monetary retainer | Running client balance, drawn down per invoice | `Retainer`/`RetainerTransaction` |
| Hours retainer | Included-hours package, optional monthly reset | `HoursRetainer`/`HoursRetainerPeriod` |
| Milestone billing | Project-scoped, optional auto-invoice on completion | `Milestone` |
| 1099/W-9 pack | Contractor payments ≥ $600/yr, not exempt, needing a W-9 | `Contractor`/`ContractorPayment`, `contractor-1099.ts` |
| Dunning | 1/3/7-day auto-charge retry then escalate | `dunning.ts`, `PaymentAttempt` |
| Credit note | `CREDIT_NOTE` invoice + `creditNoteStatus` string lifecycle | `Invoice.creditNoteStatus`, `CreditNoteApplication` |
| Tax resolution | Legacy compound calculator vs. Stripe Tax, org-level switch | `Organization.stripeTaxEnabled`, `tax-calculator.ts` |
| AR aging / DSO | Point-in-time receivables bucketed by days past due; DSO over trailing 365-day sales | `ar-reports.ts` |
| Estimated quarterly tax | Cash-basis SE tax planner, 4 IRS quarters | `EstimatedTaxPayment`, `estimated-tax.ts` |
| Month-end close | Frozen reconciliation snapshot per (org, year, month) | `PeriodClose` |

## Common mistakes

- **Reading `Invoice.total` (or `PartialPayment` rows) as "money collected."**
  Only `Payment.amount` sums represent cash in hand. This is the exact class
  of bug the project's non-negotiables call out — an LLM/engineer must never
  compute or infer a dollar figure from anything but `Payment` rows.
- **Assuming `recordPartialPayment` behaves like the Stripe webhook path.** It
  flips `PartialPayment.isPaid` and recomputes `InvoiceStatus` but does not
  insert a `Payment` row (see "Money flow" above) — verify current test
  coverage before changing either path.
- **Treating `creditNoteStatus` or `RetainerTransaction.type` as a Prisma
  enum.** Both are plain `String`/`String?` columns; there is no compiler
  exhaustiveness check on their values.
- **Assuming a proposal has an identity independent of its estimate
  invoice.** It doesn't — `ProposalContent.invoiceId` is the only key, and
  the portal/PDF/nudge/email-event surfaces all depend on that being true.
- **Assuming card/third-party contractor payments count toward the 1099-NEC
  total.** They default `reportable=false` because the processor already
  files a 1099-K for them; only flip this if you're certain it isn't double
  reporting.
- **Confusing `HoursRetainer` (time) with `Retainer` (money).** They are
  unrelated models that happen to share a name in casual conversation.
- **Assuming accrual-basis revenue exists.** All revenue/tax reporting here
  is cash-basis (grouped by `Payment.paidAt`); there is no accrual mode to
  toggle to.

## Provenance and maintenance

Verified 2026-07-05 against this repo's working tree by opening the files
below directly (not from memory or prior skill output):

- `prisma/schema.prisma` (all 2227 lines; confirmed 75 models / 35 enums)
- `src/server/routers/reports.ts` (lines 1–260)
- `src/server/services/ar-reports.ts` (full file)
- `src/server/services/contractor-1099.ts` (full file)
- `src/server/services/dunning.ts` (full file)
- `src/server/services/retainers.ts` (full file)
- `src/server/services/hours-retainers.ts` (full file)
- `src/server/services/tax-calculator.ts` (lines 1–80)
- `src/server/services/estimated-tax.ts` (lines 1–70)
- `src/server/services/partial-payments.ts` (full file)
- `src/server/routers/invoices.ts` (lines 1330–1499, plus grep hits across the
  file for `PartialPayment`/status transitions)
- `src/app/api/webhooks/stripe/route.ts` (lines 240–340)
- `src/server/routers/creditNotes.ts` (grep hits for `creditNoteStatus`)
- `README.md` (Features: Invoicing / Payments / Business Operations / AI &
  Analytics sections, lines ~33–103)
- `docs/superpowers/specs/2026-06-09-proposals-section-ai-wizard-design.md`
  (full file)
- `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`
  (grep hits for `organizationId`/`reopen` — confirms the org-scoping seed
  fact cited in the project's non-negotiables)
- `src/server/services/analytics-data.ts` (grep hits confirming the
  `total − Σpayments` balance pattern is repeated, not centralized)

Re-verify anything below before relying on it again — this domain map drifts
whenever the schema or these services change:

```bash
# Model/enum count (seed claims 75 models / 35 enums)
grep -c "^model " prisma/schema.prisma
grep -c "^enum "  prisma/schema.prisma

# Confirm the Payment-vs-PartialPayment split still holds
grep -n "payments.reduce\|partialPayments" src/server/services/ar-reports.ts src/server/services/analytics-data.ts

# Confirm recordPartialPayment still doesn't create a Payment row
grep -n "recordPartialPayment" -A 40 src/server/routers/invoices.ts | grep -n "tx.payment.create"
# (expect no match; if this now matches, the divergence noted above is resolved)

# Confirm the two tax paths and the org switch
grep -n "stripeTaxEnabled" prisma/schema.prisma

# Confirm 1099 threshold hasn't changed
grep -n "NEC_1099_THRESHOLD" src/server/services/contractor-1099.ts

# Confirm dunning schedule
grep -n "DUNNING_RETRY_OFFSETS_DAYS" src/server/services/dunning.ts
```
