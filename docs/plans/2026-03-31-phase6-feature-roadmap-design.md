# Phase 6 Feature Roadmap Design

**Date:** 2026-03-31
**Status:** Approved
**Scope:** 10 new features across 3 groups

## Build Order: A → B → C

---

## Group A — Money Mechanics

### A1: Credit Notes / Refunds

**Purpose:** Issue credit memos against paid/partially-paid invoices. Credits can be applied to future invoices or refunded externally.

**Data model:**
- New `CreditNote` model — linked to source `Invoice`, own line items, sequential numbering (CN-0001)
- Status: `draft → issued → applied → voided`
- New `CreditNoteApplication` join table — tracks which invoices a credit was applied against and the amount
- When applied, target invoice balance reduces; if fully covered, invoice moves to `paid`

**Behavior:**
- Created from invoice detail page ("Issue Credit Note" action)
- Can partially credit (e.g., credit 1 of 3 line items)
- Generates its own PDF
- Appears in P&L as negative revenue; adjusts tax liability report
- Stripe refund trigger is optional (manual or auto)

---

### A2: Deposits / Retainers

**Purpose:** Accept upfront payments from clients, held as a balance, drawn down against future invoices.

**Data model:**
- New `Retainer` model on `Client` — tracks total deposited, total applied, current balance
- New `RetainerTransaction` — each deposit or drawdown with amount, date, linked invoice (if drawdown)
- Invoice gets optional `retainerApplied` field showing how much was drawn

**Behavior:**
- Client settings page shows retainer balance and history
- When creating/sending an invoice, option to "Apply retainer" with amount input
- Retainer reduces amount due; if retainer covers full amount, invoice auto-marks as paid
- Retainer deposits can come via Stripe checkout (new "Deposit" payment type) or manual entry
- Client portal shows retainer balance
- Reports: retainer liability appears on P&L (unearned revenue until applied)

---

### A3: Late Fees / Interest

**Purpose:** Automatically assess fees on overdue invoices based on configurable rules.

**Data model:**
- New fields on `Organization`: `lateFeeType` (percentage | flat), `lateFeeAmount`, `lateFeeGraceDays`, `lateFeeRecurring` (boolean — re-apply monthly), `lateFeeMaxApplications`
- New `LateFeeEntry` model — tracks each fee applied to an invoice (date, amount, waived flag)

**Behavior:**
- Inngest cron job runs daily, finds overdue invoices past grace period
- Applies fee as a `LateFeeEntry`, updates invoice `amountDue`
- Fee shows as separate section on invoice PDF/portal (not a line item — keeps original invoice clean)
- Owner notification when fee is applied
- Manual waive option from invoice detail page
- Late fee settings in org settings under a "Policies" tab

---

### A4: Invoice-Level Discounts

**Purpose:** Apply a discount to the entire invoice, shown as a distinct line before tax.

**Data model:**
- New fields on `Invoice`: `discountType` (percentage | fixed), `discountAmount`, `discountDescription`
- Discount applied after line item subtotal, before tax calculation

**Behavior:**
- Discount section on invoice create/edit form, between line items and totals
- PDF/portal: shows as "Discount: -$X.XX" or "Discount (10%): -$X.XX"
- Discount reduces taxable amount
- Stacks with existing line-item percentage discounts (line discounts first, then invoice discount on reduced subtotal)

---

## Group B — Client Portal Upgrade

### B1: Client Self-Service Portal Dashboard

**Purpose:** Unified portal where clients log in once and see all their invoices, projects, retainer balance, and documents.

**Data model:**
- No new models — leverages existing `Client.portalToken` and magic link auth
- New `ClientPortalSession` model for session management (token, expiry, clientId)

**Behavior:**
- New route: `/portal/dashboard/[clientToken]` — authenticated via existing magic link flow
- Dashboard shows:
  - **Summary cards**: total outstanding, overdue count, retainer balance (if A2 built)
  - **Invoice table**: all invoices for this client, filterable by status, sortable by date
  - **Payment history**: list of all payments made
  - **Active projects**: if client has view permissions on projects
  - **Documents**: proposals/estimates awaiting response
- Client can pay any outstanding invoice directly from the dashboard
- Statement download (PDF) — reuses existing `/api/clients/[id]/statement`
- Mobile-responsive layout

---

### B2: E-Signatures on Proposals / Estimates

**Purpose:** Clients legally accept or reject proposals with a captured signature.

**Data model:**
- New fields on `Invoice` (for proposals/estimates): `signedAt`, `signedByName`, `signedByEmail`, `signedByIp`, `signatureData` (base64 PNG or SVG path)
- New `SignatureAuditLog` model — immutable record of signature event (timestamp, IP, user agent, hash of document at time of signing)

**Behavior:**
- Portal proposal view gets a signature capture widget:
  - **Draw** mode: canvas for finger/mouse signature
  - **Type** mode: typed name rendered in a script font
- Before signing, client sees a legal acceptance checkbox ("I agree to the terms...")
- On sign: capture signature image, record metadata, update proposal status to `accepted`
- Signed proposal PDF includes signature image, timestamp, and IP at bottom
- Email notification to owner with signed PDF attached
- Rejection flow remains as-is (button + optional reason)
- Signature data stored encrypted (reuse existing gateway encryption pattern)

---

### B3: Automated Thank-You / Follow-Up Sequences

**Purpose:** Configurable email automations triggered by invoice lifecycle events.

**Data model:**
- New `EmailAutomation` model: `trigger` (payment_received | invoice_sent | invoice_viewed | invoice_overdue), `delayDays`, `templateBody`, `templateSubject`, `enabled`, `organizationId`
- New `EmailAutomationLog` model: tracks each sent email (automationId, invoiceId, sentAt, recipientEmail)

**Behavior:**
- Built-in triggers:
  - `payment_received` → "Thank you for your payment" (delay: 0 = immediate)
  - `invoice_sent` + no view after 3 days → "Just following up on invoice #X"
  - `invoice_overdue` + 7 days → "Friendly reminder: invoice #X is overdue"
- Settings page: `/settings/automations` — list automations, toggle on/off, edit templates
- Templates support variables: `{{clientName}}`, `{{invoiceNumber}}`, `{{amountDue}}`, `{{dueDate}}`, `{{paymentLink}}`
- Inngest scheduled jobs evaluate triggers and send after delay
- Respects existing BCC owner preference
- Won't double-send if manual email already sent for that event
- Automation log viewable per invoice ("Automated emails" section)

---

## Group C — Operational Automation

### C1: Expense Receipt OCR

**Purpose:** Upload a receipt photo/PDF and auto-extract vendor, amount, date, and category to pre-fill the expense form.

**Data model:**
- New fields on `Expense`: `ocrRawResult` (JSON), `ocrConfidence` (number)
- No new models — enriches existing expense creation flow

**Behavior:**
- Expense create form gets a "Scan Receipt" dropzone at the top
- On upload, sends image to `/api/expenses/receipt/ocr` endpoint
- Backend uses Claude Vision API to extract:
  - Vendor name → maps to existing `ExpenseSupplier` if match found, else suggests new
  - Total amount + currency
  - Date
  - Category guess based on vendor/description
- Returns pre-filled form fields with confidence indicators (green/yellow/red)
- User reviews and corrects before saving — OCR never auto-submits
- Receipt image stored as attachment (existing attachment system)
- Works for photos (JPG/PNG) and PDF receipts

---

### C2: Dashboard / KPIs Homepage

**Purpose:** Visual overview of business health as the landing page after login.

**Data model:**
- No new models — all data derived from existing queries
- New `dashboardSummary` tRPC procedure aggregating key metrics

**Behavior:**
- Route: `/(dashboard)` — the homepage after login
- **Top row — summary cards:**
  - Total revenue (this month vs last month, % change)
  - Outstanding invoices (count + total amount)
  - Overdue invoices (count + total, with alert styling)
  - Cash collected this month
- **Charts row:**
  - Revenue trend (line chart, last 12 months) — reuse `revenueByMonth` data
  - Invoice status breakdown (donut chart — draft/sent/paid/overdue)
  - Expenses vs Revenue (stacked bar, last 6 months)
- **Activity feed:**
  - Recent invoice views, payments received, proposals accepted
  - Pulls from existing notifications + audit log
- **Quick actions bar:** Create Invoice, New Client, Log Expense, Start Timer
- Chart library: recharts (React-native, composable, lightweight)
- Date range selector: This Month / This Quarter / This Year / Custom
- Responsive: cards stack on mobile, charts go full-width

---

### C3: Recurring Expense Auto-Creation

**Purpose:** Activate the existing `RecurringExpense` schema — auto-generate expenses on schedule.

**Data model:**
- Existing `RecurringExpense` model already has: `frequency`, `nextRunDate`, `endDate`, `amount`, `categoryId`, `supplierId`
- Add fields: `lastRunDate`, `totalGenerated` (counter), `isActive` (boolean)

**Behavior:**
- Inngest cron job (`recurring-expenses`) runs daily
- Finds all active recurring expenses where `nextRunDate <= today`
- Creates `Expense` record copying template fields (amount, category, supplier, tax, notes)
- Advances `nextRunDate` based on frequency
- Respects `endDate` — auto-deactivates when reached
- Notification to owner: "Recurring expense generated: $X for [supplier]"
- UI: existing `/expenses/recurring` page gets an "Active/Paused" toggle per template
- Expense list shows a "recurring" badge on auto-generated expenses with link back to template
- Audit log entry for each generation

---

## Feature Summary

| # | Feature | Group | New Models | Complexity |
|---|---------|-------|------------|------------|
| A1 | Credit Notes / Refunds | A | CreditNote, CreditNoteApplication | High |
| A2 | Deposits / Retainers | A | Retainer, RetainerTransaction | High |
| A3 | Late Fees / Interest | A | LateFeeEntry + org fields | Medium |
| A4 | Invoice-Level Discounts | A | Invoice fields only | Low |
| B1 | Client Portal Dashboard | B | ClientPortalSession | Medium |
| B2 | E-Signatures | B | SignatureAuditLog + invoice fields | Medium |
| B3 | Email Automations | B | EmailAutomation, EmailAutomationLog | Medium |
| C1 | Receipt OCR | C | Expense fields only | Medium |
| C2 | Dashboard / KPIs | C | None (new tRPC procedure) | Medium |
| C3 | Recurring Expense Auto-Creation | C | RecurringExpense fields | Low |
