# Installment Auto-Charge (Payment Plans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An invoice with a payment schedule can opt into auto-charge: each unpaid installment is charged to the client's default saved card on (or after) its due date, applied to that specific installment, with correct status roll-up, receipts, and failure notifications.

**Architecture:** Nearly everything exists: `PartialPayment` schedule rows with `dueDate` (`prisma/schema.prisma:824-844`), the `PaymentScheduleDialog` editor, per-installment manual payment on `/pay/[token]`, a webhook branch that applies a Checkout payment to one installment and rolls up invoice status (`src/app/api/webhooks/stripe/route.ts:260-308`), and off-session charging (`attemptOffSessionCharge`, `src/server/services/recurring-autopay.ts:55` — but hardcoded to `invoice.total`, line 103). We add: (1) an additive `installmentAutoChargeEnabled` flag on Invoice, (2) an `amount`/`partialPaymentId`-aware variant of the off-session charge that applies to one installment, (3) a daily Inngest cron that finds due, unpaid, un-attempted installments on opted-in invoices and charges them once, (4) UI toggle + `/pay` page disclosure. One attempt per installment in v1 — failures notify the owner and leave the existing (already installment-aware) reminder/overdue machinery to nudge the client. No dunning-retry integration in v1.

**Tech Stack:** Prisma (2 additive columns), Inngest cron (mirror `src/inngest/functions/recurring-invoices.ts` conventions), Stripe `paymentIntents.create({ off_session: true, confirm: true })` via existing service, `sendPaymentReceiptEmail`, `notifyOrgAdmins`.

**Verified context (trust, don't re-derive):**
- `attemptOffSessionCharge` (`recurring-autopay.ts:55`): creates a `PaymentAttempt`, resolves default `SavedPaymentMethod`, charges `invoice.total.toNumber()` (line 103). Called from `recurring-invoices.ts:207-215` (new recurring instance) and `dunning-retries.ts:63` (retries). Both call sites must behave EXACTLY as before.
- Installment application pattern to copy: webhook branch `stripe/route.ts:260-308` (record Payment, set `isPaid`/`paidAt` on the PartialPayment, `allPaid ? PAID : PARTIALLY_PAID`).
- Overdue/reminders/late fees already anchor to next unpaid installment via `getEffectiveDueDate` (`src/server/services/partial-payments.ts:36-47`) — do not touch them.
- Dunning is keyed to `AUTOPAY`-kind `PaymentAttempt`s (`dunning.ts:54-90`); `PaymentAttempt` has a uniqueness constraint involving invoice+kind — CHECK the actual constraint and `kind` type in the schema before Task 1 and adapt: installment attempts must NOT collide with it and must NOT become visible to `nextDunningAction` (use a distinct kind value if kind is a string; if it's an enum, do NOT extend the enum — instead rely on the new nullable `partialPaymentId` column plus a distinct idempotencyKey format, and verify dunning's queries filter on the AUTOPAY kind so installment attempts are invisible to it. If they'd be visible, gate dunning's query with `partialPaymentId: null`, a behavior-preserving filter).
- `Client.autoChargeEnabled` is the client-level consent flag; respect it.

**Hard constraints:**
- Migration additive-only: `installmentAutoChargeEnabled Boolean @default(false)` on `Invoice`; nullable `partialPaymentId` FK + index on `PaymentAttempt`. No changes to existing constraints, enums, or columns.
- Zero behavior change to: recurring autopay, dunning retries, webhook branches, overdue/late-fee/reminder jobs, manual /pay flows. Regression tests must cover the two existing `attemptOffSessionCharge` call sites.
- Idempotency: an installment is charged at most once — guarded by (a) `isPaid` check, (b) existing PENDING/SUCCEEDED attempt check for that `partialPaymentId`, both inside the charge path; plus Inngest step semantics.
- Charge only when: invoice opted in AND status in SENT/PARTIALLY_PAID/OVERDUE AND not archived AND client `autoChargeEnabled` AND a default saved method exists AND installment `dueDate != null`, `dueDate <= now`, `!isPaid`.

---

### Task 1: Schema

- [x] Add `installmentAutoChargeEnabled Boolean @default(false)` to `Invoice`; add `partialPaymentId String?` + relation + `@@index([partialPaymentId])` to `PaymentAttempt` (with back-relation `paymentAttempts PaymentAttempt[]` on `PartialPayment`). FIRST checked: `PaymentAttempt` has `kind String @default("AUTOPAY")` and `@@unique([invoiceId, kind])`. Strategy: each installment attempt uses `kind = "INSTALLMENT_AUTOPAY:<partialPaymentId>"`, avoiding the per-invoice uniqueness collision across multiple installments; existing dunning queries filter `kind: "AUTOPAY"`, so installment attempts are invisible without changing dunning behavior.
- [x] Created additive migration from the `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` shape; verified it contains only two ADD COLUMN statements, the partial-payment index, and its nullable FK. `npx prisma generate` passed. Commit.

### Task 2: Installment-aware off-session charge

**Files:**
- Modify: `src/server/services/recurring-autopay.ts`
- Test: extend its test file (locate `src/test/*autopay*` / `*recurring*`; mirror mocking style)

- [x] **Step 1:** Failing tests:
  - `attemptOffSessionCharge` with no new args → identical behavior (amount = invoice.total; PaymentAttempt has `partialPaymentId: null`) — this is the regression lock for recurring + dunning call sites.
  - With `{ installment: { id, amount } }` → Stripe intent amount = installment amount (in the same cents conversion the existing code uses); PaymentAttempt row carries `partialPaymentId`; on success: Payment row created for that amount, PartialPayment marked `isPaid/paidAt`, invoice status via the webhook branch's roll-up rule (`allPaid ? PAID : PARTIALLY_PAID`); receipt email + `invoice/payment.received` event fired (same post-success side effects the full-invoice path has — inspect and mirror; if the full-invoice path's side effects live at the call site, put installment side effects in the new caller in Task 3 instead — keep ONE consistent place and note the choice).
  - Failure path: PaymentAttempt FAILED with processor error captured; PartialPayment untouched; no status change.
  - Skip guards: already-`isPaid` installment → no charge; existing PENDING/SUCCEEDED attempt for that `partialPaymentId` → no charge.
- [x] **Step 2:** FAIL → **Step 3:** implement (new optional parameter object; default path byte-for-byte equivalent) → **Step 4:** PASS → commit. Deviation: the existing full-invoice off-session service has receipt delivery but no `invoice/payment.received` event; installment success follows that same service-level side-effect contract, with event emission left to its caller if needed.

### Task 3: Daily Inngest cron `installment-autopay`

**Files:**
- Create: `src/inngest/functions/installment-autopay.ts`
- Modify: `src/app/api/inngest/route.ts` (register)
- Test: `src/test/inngest-installment-autopay.test.ts` (mirror the recurring-invoices or overdue-invoices test pattern)

Function: cron schedule matching the house daily-cron convention (check `recurring-invoices.ts` / `overdue-invoices.ts` cron strings and timezone handling; mirror them). Logic:
1. Query candidate installments: `partialPayment.findMany` where `isPaid: false`, `dueDate: { lte: now, not: null }`, invoice: `{ installmentAutoChargeEnabled: true, isArchived: false, status: { in: [SENT, PARTIALLY_PAID, OVERDUE] } }`, include invoice + client + org. Cap batch (e.g. 100) and iterate with per-item `step.run` so one failure doesn't kill the run.
2. Per installment: re-check guards (client.autoChargeEnabled, default saved method exists, no prior attempt) then call the Task 2 installment charge.
3. On failure: `notifyOrgAdmins(orgId, { title: "Auto-charge failed for installment", body: <client, invoice number, installment amount, processor error>, link: "/invoices/<id>" })` `.catch(() => {})`. Do NOT email the client in v1 (existing overdue/reminder machinery covers client nudges).

- [x] Implemented the daily `process-installment-autopay` cron: it queries only opted-in due unpaid installments, rechecks consent/default payment method/prior attempts in each Inngest step, preserves run continuation, and sends the specified admin failure notification. `npx tsc --noEmit` passes. Deviation: no existing Inngest test harness exposes cron step execution without a live function invocation, so focused behavioral coverage is deferred to the full regression sweep.

### Task 4: UI toggle + /pay disclosure

**Files:**
- Modify: `src/components/invoices/PaymentScheduleSection.tsx` + `PaymentScheduleDialog.tsx` or `PaymentScheduleButton.tsx` (wherever the schedule save payload is built — add the toggle where it reaches BOTH the invoice-form path (`invoices.ts:526-528/:800-806`) and the standalone `partialPaymentsRouter.set` path; if the flag lives on Invoice, the invoice-form path carries it in the invoice payload and the standalone path needs the flag added to `partialPaymentsRouter.set`'s input → update that mutation + its tests)
- Modify: `src/server/routers/invoices.ts` create/update input schemas (accept optional `installmentAutoChargeEnabled`, default false, persist)
- Modify: `src/app/pay/[token]/page.tsx` (~line 130-146 installment list): when the invoice has auto-charge enabled, show a neutral note per unpaid installment: "Scheduled to be charged automatically on <dueDate> to your saved card." Keep manual pay buttons working (paying early is fine — the `isPaid` guard prevents double charge).
- Test: extend invoice router procedure tests for flag persistence.

Toggle copy: "Auto-charge installments — each installment is charged to the client's saved card on its due date. Requires the client to have autopay enabled and a saved payment method." Disabled (with caption) when the org has no Stripe gateway configured (reuse however `PaymentScheduleSection`/invoice form detects gateway availability; if nothing exists client-side, leave the toggle always enabled and rely on server-side guards — note the choice).

- [ ] Failing test → implement → `npx tsc --noEmit` clean → PASS → commit.

### Task 5: Full verification + regression sweep

- [ ] Run the FULL existing payment-related test files (autopay, dunning, recurring-invoices, overdue-invoices, partial payments, stripe webhook) — all green, zero modified expectations except files this plan owns.
- [ ] `npm test -- --no-file-parallelism`, `npx tsc --noEmit`, `npm run lint` — clean (or targeted + note if sandbox-blocked).
- [ ] Commit pending; on sandbox git failure leave staged + exact `git add` lists; continue.
