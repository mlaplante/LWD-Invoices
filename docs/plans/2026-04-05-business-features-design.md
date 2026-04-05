# Business Features Design

**Goal:** Ship 6 features that make Pancake more compelling to freelancers and small businesses: invoice preview, dashboard analytics, branded portal, payment confirmation polish, auto-charge recurring invoices, and deposit invoices.

**Priority order:** Invoice preview → Dashboard analytics → Branded portal + payment confirmation → Auto-charge → Deposits

---

## 1. Invoice Preview Before Sending

When the user clicks "Send Invoice" on a draft invoice detail page, a dialog opens showing a rendered preview of the email the client will receive. The user can review and confirm or cancel.

**UI:** AlertDialog containing:
- Recipient email ("To: client@example.com")
- Subject line
- Rendered InvoiceSentEmail HTML in a sandboxed iframe
- "Send Invoice" (primary) and "Cancel" buttons

**New tRPC procedure:** `invoices.previewEmail` — takes `{ id }`, renders InvoiceSentEmail server-side, returns `{ to, subject, html }`. No side effects.

**Scope:** Single invoice send only. Bulk send unchanged. `?send=1` auto-send skips preview.

---

## 2. Dashboard Analytics Enhancement

**New KPI card:** Expenses This Month (data already computed server-side, just not displayed).

**New sections below existing charts:**

- **Top Clients by Revenue** — Top 5 clients by payment total for current month. Columns: Client Name, Invoices Paid, Revenue. Clickable rows.
- **Aging Receivables** — 5 buckets: Current (not due), 1-30, 31-60, 61-90, 90+ days. Dollar amount + invoice count per bucket.
- **Estimate Conversion Rate** — Estimates sent vs accepted for current month, conversion %, trend vs last month.

**New tRPC procedures in `dashboard.ts`:**
- `topClients` — aggregate payments by client, current month, top 5
- `agingReceivables` — group unpaid invoices by days since due date
- `estimateConversion` — count estimates by status (SENT vs ACCEPTED)

---

## 3. Branded Portal (Color)

**Schema:** Add `brandColor` (nullable hex string) to Organization model.

**Settings UI:** Color picker on organization settings page alongside logo upload.

**Portal:** Layout reads `organization.brandColor`, sets CSS custom property `--brand-color`. Header, buttons, links, accents use it. Falls back to `#2563eb`.

**Email:** Wire org `brandColor` into the existing `brandColor` prop on InvoiceSentEmail and other email templates.

**Scope:** Color only. No custom domains. No white-label footer changes.

---

## 4. Payment Confirmation Polish

Enhance `portal/[token]/payment-success/page.tsx` and `pay/[token]/success/page.tsx`:

- Org logo + name (branded header)
- Checkmark icon + "Payment received"
- Amount paid + invoice number
- "You'll receive a receipt email shortly"
- "Back to Invoice" link
- Brand color accent

---

## 5. Auto-Charge Recurring Invoices

**Stripe Customer + Saved Cards:**
- Add `stripeCustomerId` (nullable) to Client model
- Modify Stripe Checkout to set `payment_intent_data.setup_future_usage: "off_session"` — saves card automatically
- Webhook stores `stripeCustomerId` on Client
- Client detail page shows "Card on file" badge + "Remove card" action
- Add `autoChargeEnabled` (boolean, default false) to Client model

**Auto-charge flow (in recurring invoices Inngest cron):**
- Client has `stripeCustomerId` + `autoChargeEnabled` → attempt `stripe.paymentIntents.create({ customer, amount, off_session: true, confirm: true })`
- Success → mark PAID, send receipt, audit log
- Failure → send invoice normally, notify org admin "Auto-charge failed"

**PayPal/check clients:** Unaffected. Auto-charge is Stripe-only.

---

## 6. Deposit Invoices

**New invoice type:** Add `DEPOSIT` to `InvoiceType` enum.

**Credit balance:**
- Add `creditBalance` (Decimal, default 0) to Client model
- When deposit invoice is paid, add payment amount to `client.creditBalance`
- Client detail page shows credit balance

**Applying credits:**
- Invoice create/edit: if client has credit > 0, show "Apply credit" toggle
- Add `creditApplied` (Decimal, default 0) to Invoice model
- Portal shows original total with "Credit applied: -$X" line, then balance due
- On send/pay: deduct `creditApplied` from `client.creditBalance`
- If credit covers full amount, auto-mark as PAID
