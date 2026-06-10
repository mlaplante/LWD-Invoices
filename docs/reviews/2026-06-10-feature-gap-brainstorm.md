# Feature Gap Brainstorm — June 2026

A survey of features the product does **not** yet have, grouped by theme.
Compiled against the current codebase (post Money-Intelligence hub, proposals
AI wizard, tax dashboard, month-end close). Items already on the May audit
roadmap (`docs/reviews/AUDIT-2026-05.md`) are cross-referenced rather than
re-pitched.

## Shortlist (highest leverage first)

1. **Bank feeds + deposit reconciliation** — the biggest functional hole.
2. **Accounting export/sync (QuickBooks / Xero)** — the month-end close agent
   already drafts adjusting entries; exporting them is the natural next step.
3. **Competitor importers (FreshBooks / Wave / QuickBooks / CSV)** — the #1
   adoption blocker for a SaaS like this; nobody re-keys 300 clients.
4. **ACH / direct-debit payments + card-fee pass-through** — directly lowers
   the cost of getting paid.
5. **Client self-service billing in the portal** (manage saved cards, enroll in
   autopay, download statements/receipts) — autopay exists but only org-side.

---

## 1. Money movement & reconciliation

- **Bank feeds (Plaid / Teller / GoCardless)** — import bank transactions,
  auto-match deposits to open invoices and debits to expenses/recurring
  expenses. Today reconciliation is inferred from gateway webhooks only;
  BANK_TRANSFER / CHECK / CASH payments are recorded manually with no
  source-of-truth check. This would also make the month-end close agent's
  invoice↔payment integrity pass authoritative instead of self-referential.
- **ACH / direct debit (Stripe ACH, SEPA)** — cheaper rails than cards for
  the retainer/recurring-autopay base. Pairs with:
- **Card surcharge / convenience-fee pass-through** — "pay by bank free, or
  card +2.9%" choice on the pay page (where legal; needs per-region rules).
- **Bad-debt write-off as a first-class invoice outcome** — the close agent
  drafts write-offs, but there's no `WRITTEN_OFF` terminal status flowing
  into P&L and client history.
- **Client prepayment / wallet balance** — credit notes exist, but there's no
  general "client paid $5k up front, draw invoices against it" ledger outside
  fixed retainers.
- **Payment receipts** — confirm a branded receipt email/PDF goes out on every
  payment (incl. manual methods), downloadable from the portal.

## 2. Accounting & tax ecosystem

- **QuickBooks / Xero integration** — start with one-way journal/CSV export
  mapped to a chart of accounts; later two-way sync. The audit's webhook +
  OpenAPI items (E1/E3) are prerequisites for partner-built versions.
- **Quarterly estimated-tax planner (US)** — safe-harbor calculation from
  live P&L, a "set aside X%" running tally, and Inngest reminders before the
  four IRS deadlines. Natural extension of the new tax dashboard.
- **W-8BEN for foreign contractors** — the contractor pack is W-9/1099-only;
  foreign payees currently have no path. Even just "collect + store W-8BEN,
  exclude from 1099" closes the gap.
- **E-invoicing standards (EU/intl)** — UBL/PEPPOL, Factur-X/ZUGFeRD are
  becoming legally mandatory across the EU. Determines whether the product
  can ever serve non-US freelancers. Pairs with proper VAT handling
  (VAT IDs, reverse-charge notes, VIES validation).

## 3. Sales & pre-invoice pipeline

- **Lightweight lead/deal pipeline** — proposals are the first artifact today;
  there's nothing for "talked to a prospect, following up Tuesday."
  A small kanban (lead → qualified → proposal sent → won/lost) that converts
  into the existing client + proposal objects. Win-rate reporting falls out
  of proposal engagement data already collected.
- **Pay-deposit-to-accept proposals** — e-signature and DEPOSIT invoices both
  exist; combining them ("sign + pay 30% to start") is a classic
  freelancer-closing flow and mostly composition of existing pieces.
- **Standalone contracts / SOWs with counter-signing** — e-sign is currently
  proposal-bound and single-party. Reusable contract templates, both-party
  signatures, and change orders linked to projects.
- **PO number field on invoices** — tiny, but a perpetual request from anyone
  invoicing companies with procurement.

## 4. Team workflows (multi-user orgs)

- **Invoice approval workflow** — roles exist (OWNER/ADMIN/ACCOUNTANT/VIEWER)
  but anyone who can create can send. Draft → internal approval → send, with
  a per-org toggle and amount threshold.
- **Timesheet submission/approval** — time entries are trusted as-entered;
  teams billing clients for staff hours generally need a review gate before
  hours become invoice lines.
- **Per-user notification preferences & client/project ownership** — all
  admins get everything today; assignment + routing keeps larger orgs sane.

## 5. Client portal upgrades

- **Self-service billing** — let clients add/replace saved cards, opt in/out
  of autopay, and see upcoming auto-charges. Currently gateway-side only.
- **Statements, receipts, YTD summaries on demand** — statement PDFs exist
  server-side; surface them to the client.
- **Email preferences / unsubscribe for clients** — audit item A7; required
  for CAN-SPAM/GDPR once mail goes beyond transactional (check-ins, nudges).
- **Custom-domain white-label portal** — portal branding exists; a CNAME +
  per-org domain is the last mile for agencies that resell.

## 6. Platform, growth & integrations

- **Importers** — CSV plus dedicated FreshBooks/Wave/QuickBooks importers for
  clients, invoices (with history), items, and open balances. Without this,
  every prospective user starts from zero.
- **Zapier/Make + public webhooks + OpenAPI** — audit E1/E3; also expand the
  REST v1 surface (payments, expenses, time entries are missing).
- **Slack / Teams notifications** — "Invoice #1042 was paid 🎉" is the
  highest-delight integration per unit of effort.
- **iCal feed** — invoice due dates, milestone targets, recurring schedules
  as a read-only calendar subscription.
- **Auth conveniences** — Google OAuth, magic links, passkeys (all cheap via
  Supabase Auth providers).
- **i18n** — translated invoice/portal templates and localized number/date
  formats; clients abroad receive English-only documents today.
- **PWA + push notifications** — installable app, push for "paid/overdue,"
  share-sheet receipt capture into OCR, offline-tolerant timer.
- **GDPR/data portability** — full org export (JSON/CSV bundle) and a real
  account-deletion path.

## 7. Small but high-leverage

- **Mileage tracking** — deductible, universally requested by US freelancers;
  fits the existing expense model (rate × miles).
- **Expense budgets vs. actuals** — per-category monthly budgets with
  variance on the Money Intelligence hub.
- **Invoice scheduling** — "send this Thursday 9am" one-off send scheduling
  (the best-send-window hint already computes the recommendation; let users
  act on it without coming back).
- **`TODO(plan-4-followup)`** in `GenerateProposalButton.tsx` — surface
  `suggestedItems` from the proposal wizard; only open TODO in the codebase.

## Already tracked elsewhere (not re-pitched)

- API keys for `/api/v1` (audit S2), public webhooks (E1), OpenAPI (E3),
  admin observability (E2), usage quotas (E4), email-preference model (A7).
- Duplicate-invoice detection (E5) — shipped in the Money Intelligence work.
