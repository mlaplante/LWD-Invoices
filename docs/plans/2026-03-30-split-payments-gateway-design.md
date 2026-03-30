# Split Payments Gateway Integration Design

**Date:** 2026-03-30
**Status:** Approved

## Overview

Integrate the payment schedule (split payments) feature with Stripe and PayPal gateways so clients can pay individual installments or the full remaining balance through the portal.

## Decisions

- **Approach:** Parameterized checkout — extend existing `createStripeCheckout` mutation and PayPal URL to accept optional installment parameters
- **Portal UI:** Per-installment "Pay" buttons + "Pay Full Balance" button
- **Status progression:** Automatic — `PARTIALLY_PAID` after each installment, `PAID` when all complete
- **Full balance calculation:** `invoiceTotal - sum(Payment records)` (source of truth from actual payments)

## Portal UI

When an invoice has a payment schedule with unpaid installments:
- Each unpaid installment row in the Payment Schedule table gets a "Pay" button (Stripe/PayPal per enabled gateways)
- The button shows the installment amount + surcharge
- Below the schedule table: a "Pay Full Balance" button charging `invoiceTotal - sum(existingPayments)` + surcharge
- When no schedule exists: behavior unchanged — current full-payment buttons remain

`PaymentButtons` gets two new optional props:
- `partialPaymentId?: string` — identifies the installment being paid
- `amountOverride?: number` — the amount to charge (before surcharge)

## Stripe Checkout Flow

`createStripeCheckout` mutation gets two new optional inputs:
- `partialPaymentId?: string` — charge that installment's amount
- `payFullBalance?: boolean` — charge remaining balance

**Amount resolution (server-side):**
1. `partialPaymentId` provided → look up partial payment, resolve amount (if percentage, calculate from invoice total)
2. `payFullBalance` provided → `invoiceTotal - sum(all Payment records)`
3. Neither → full invoice total (backward compatible)

Stripe session metadata gains `partialPaymentId` field for webhook correlation.

PayPal URL follows same logic — amount calculated server-side, embedded in URL.

## Webhook & Status Logic

Stripe webhook (`checkout.session.completed`) branching:

**If `partialPaymentId` in metadata:**
1. Record Payment for installment amount
2. Mark that PartialPayment as paid (`isPaid: true`, `paidAt: now`)
3. Check if ALL partial payments are paid → `PAID`, otherwise `PARTIALLY_PAID`

**If no `partialPaymentId` (full balance):**
1. Record Payment for charged amount
2. Mark ALL unpaid partial payments as paid
3. Set invoice status to `PAID`

**Idempotency:** Check if specific partial payment is already `isPaid` (handles Stripe retries). Existing check for invoice `PAID` status remains.

**Receipt email:** Sent after every successful payment, same as today.

## Files to Modify

- `src/server/routers/portal.ts` — extend `createStripeCheckout` input/logic
- `src/app/api/webhooks/stripe/route.ts` — add partial payment handling
- `src/components/portal/PaymentButtons.tsx` — accept `partialPaymentId` and `amountOverride` props
- `src/app/portal/[token]/page.tsx` — render per-installment pay buttons + pay full balance button, calculate PayPal URLs per installment
