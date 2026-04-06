# Frictionless Payment Path v1

**Date:** 2026-04-05
**Goal:** Help solo freelancers get paid faster and reduce pre-launch support burden
**Target users:** Solo freelancers/contractors with mixed-payment clients (online + offline)

## Problem

Freelancers lose revenue to two problems:
1. **Clients ignore invoices** — emails go unread, payment links get buried
2. **Payment friction** — too many steps between seeing an invoice and completing payment

Secondary goal: preempt support issues before launch by giving freelancers better visibility into what's owed.

## Features

### 1. One-Tap Payment from Email

**What:** Invoice emails include a prominent "Pay $X.xx Now" button linking directly to `/pay/[token]`.

**Behavior:**
- The CTA button links to the existing `/pay/[token]` instant checkout page — no portal login required
- The `/pay/[token]` page shows a quick invoice summary (amount, due date, line items preview) above the payment form
- For Stripe: routes to Stripe Checkout. For PayPal: routes to PayPal flow. For manual methods (bank transfer, check, etc.): displays payment instructions with a "I've Sent Payment" confirmation button
- If the invoice is already fully paid, the page shows paid status instead of a pay button
- If partially paid, the page shows remaining balance with a pay button for that amount

**Changes required:**
- Update invoice email templates (Resend) with a styled CTA button
- Enhance `/pay/[token]` page with invoice summary section
- Add partial payment support to the `/pay` page — display remaining balance when partially paid

**Existing infrastructure leveraged:**
- Token-based auth (no login) — already built
- Stripe Checkout session creation — already built
- `/pay/[token]` route — already built, needs enhancement

### 2. Payment Method on File

**What:** Repeat clients save their card via Stripe so future invoices can be paid with one click or auto-charged.

**Behavior:**
- After paying via Stripe Checkout, clients are offered "Save this card for future invoices"
- A Stripe Customer is created (or linked) and a PaymentMethod attached
- On subsequent invoices, `/pay/[token]` shows "Pay with Visa ending 4242" as default, plus "Use a different method"
- For recurring invoices, the freelancer can enable auto-charge — when the invoice generates, the saved card is charged automatically and the invoice marked as paid
- Clients can remove saved cards from their portal dashboard

**Data model changes:**
- `Client` — add `stripeCustomerId` (String, nullable)
- New model `SavedPaymentMethod`:
  - `id` (String, cuid)
  - `clientId` (String, FK to Client)
  - `organizationId` (String, FK to Organization)
  - `stripePaymentMethodId` (String)
  - `last4` (String)
  - `brand` (String)
  - `expiresMonth` (Int)
  - `expiresYear` (Int)
  - `isDefault` (Boolean, default true)
  - `createdAt` (DateTime)
- `RecurringInvoice` — add `autoCharge` (Boolean, default false)

**Security:**
- No card numbers stored locally — only Stripe references (PaymentMethod IDs)
- Saved methods scoped to client + organization (multi-tenant safe)
- Auto-charge requires explicit opt-in from both freelancer (toggle on recurring invoice) and client (saving the card)

**Failure handling:**
- If auto-charge fails (expired card, insufficient funds, Stripe decline), the invoice generates with SENT status and the client receives a standard payment email
- Freelancer receives an in-app notification that auto-charge failed, with the reason

### 3. Auto-Receipts on Payment

**What:** Instant email confirmation to the client when any payment is recorded.

**Behavior:**
- Triggered when any payment is recorded: Stripe webhook, PayPal webhook, or manual recording by the freelancer
- Receipt email includes: amount paid, payment method, date, invoice number, remaining balance (if partial), link to download PDF receipt
- For fully paid invoices: "Paid in full" message with thank-you
- For partial payments: shows remaining balance with a "Pay remaining $X.xx" button linking to `/pay/[token]`

**What needs to be built:**
- Receipt email template (Resend, same infrastructure as invoice emails)
- PDF receipt generator (lightweight — payment confirmation details only, not full invoice)
- Trigger hook in `payments.create` tRPC procedure and Stripe/PayPal webhook handlers

**Freelancer controls:**
- Enabled by default
- Org-level setting to disable
- Branded with org logo and brand color (same as invoice emails)

**No new models needed** — receipts generated on-the-fly from existing `Payment` + `Invoice` data.

### 4. Overdue Dashboard Widget

**What:** At-a-glance view of outstanding money on the dashboard home page.

**Behavior:**
- Widget displays three sections:
  - **Total outstanding** — sum of all unpaid/partially paid invoices
  - **Overdue** — sum of invoices past due date, with count (e.g., "$4,200 across 3 invoices"), displayed in red/warning
  - **Due this week** — invoices due in the next 7 days, displayed in amber
- Each section is clickable — links to the invoice list with appropriate filters pre-applied
- Color-coded: overdue = red, due soon = amber, current = green

**What needs to be built:**
- `invoices.dashboardSummary` tRPC query — aggregates outstanding amounts grouped by status/due date
- `OverdueSummaryWidget` React component on the dashboard page
- URL-based filter params for the invoice list page (the list already supports filtering; this pre-sets the filter via query params)

**No new models needed** — queries existing invoice data.

## Deferred to v2

- **SMS invoice delivery** — text payment links to clients via Twilio. Deferred due to external provider dependency, compliance requirements (STOP opt-out, rate limiting), and added operational complexity. Not essential for launch.

## Architecture Notes

- All features build on existing infrastructure (Resend emails, Stripe integration, `/pay/[token]` routes, tRPC procedures)
- Payment method on file is the most complex feature — requires Stripe Customer lifecycle management and webhook enhancements
- Auto-receipts and dashboard widget are low-effort, high-value additions
- Multi-tenant safety: all queries and saved payment methods are scoped to organization
