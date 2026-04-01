# Phase 7 Feature Roadmap Design

**Date:** 2026-04-01
**Status:** Approved
**Scope:** 6 new features across 3 groups

## Build Order: D → E → F

---

## Group D — Portal & Branding

### D1: White-Label Portal Branding

**Purpose:** Extend existing Organization branding to fully customize the client portal appearance and remove default branding.

**Data model:**
- Add to Organization: `portalTagline` (String?), `portalFooterText` (String?), `brandFont` (String? — "inter" | "georgia" | "system"), `hidePoweredBy` (Boolean, default false)
- Existing fields already cover: `brandColor`, `logoUrl`, `name`

**Behavior:**
- Portal layout reads these fields and applies them to header, footer, typography
- "Powered by LWD Invoices" footer is hidden when `hidePoweredBy = true`
- Settings page gets a "Portal Branding" section with live preview
- Portal dashboard, invoice view, login page, and proposal view all respect branding
- Email templates also use brandColor/logo (already partially done via BCC feature)

---

### D2: Invoice Templates / Themes

**Purpose:** 4 pre-built PDF layouts with color/font customization.

**Data model:**
- Add to Organization: `invoiceTemplate` (String, default "modern" — "modern" | "classic" | "minimal" | "compact"), `invoiceFontFamily` (String? — "helvetica" | "georgia" | "courier"), `invoiceAccentColor` (String? — falls back to brandColor), `invoiceShowLogo` (Boolean, default true), `invoiceFooterText` (String?)

**Templates:**
- **Modern** (current) — clean, rounded cards, colored header bar
- **Classic** — traditional business layout, bordered table, serif option
- **Minimal** — lots of whitespace, no borders, left-aligned
- **Compact** — dense, smaller fonts, fits more on one page

**Behavior:**
- Settings page: `/settings/invoices` gets template picker with visual previews
- PDF generation reads org template preference and dispatches to the right renderer
- Each template is a separate React PDF component sharing a common `FullInvoice` data interface
- Portal invoice view also adapts styling to match the selected template
- Preview button in settings shows a sample PDF

---

## Group E — Operational Efficiency

### E1: Bulk Operations

**Purpose:** Select multiple invoices and perform batch actions.

**Data model:**
- No new models — all operations use existing mutations in batch

**Behavior:**
- Invoice list page gets checkbox selection (header checkbox for select-all)
- Floating action bar appears when items selected: "Send (X)", "Archive (X)", "Mark Paid (X)", "Delete (X)"
- Bulk send: calls invoices.send for each selected draft/sent invoice, shows progress toast
- Bulk archive: calls invoices.archive for each
- Bulk mark paid: calls invoices.markAsPaid for each (with today's date)
- Bulk delete: confirm dialog, then delete each
- Error handling: partial failures show "5 of 7 sent, 2 failed" summary
- Works on both desktop table and mobile card layouts
- Same pattern extended to expenses list (bulk delete, bulk categorize)

---

### E2: Auto-Reminder Escalation

**Purpose:** Configurable multi-step reminder sequences that fire relative to due date, continuing until paid.

**Data model:**
- New `ReminderSequence` model: `organizationId`, `name`, `isDefault` (Boolean), `enabled`
- New `ReminderStep` model: `sequenceId`, `daysRelativeToDue` (Int — negative = before, 0 = on, positive = after), `subject`, `body`, `sort`
- New `ReminderLog` model: `stepId`, `invoiceId`, `sentAt` — prevents double-sends
- Invoice gets optional `reminderSequenceId` (override per-invoice)

**Behavior:**
- Default sequence created on org setup: [-3, 0, +7, +14, +30] days
- Settings page: `/settings/reminders` — manage sequences, add/remove/reorder steps
- Each step has customizable subject/body with template variables (same as email automations)
- Inngest daily cron evaluates each invoice against its sequence:
  - Find the next unsent step where `dueDate + daysRelative <= today`
  - Check ReminderLog to prevent double-send
  - Send via Resend, log it
  - Only fires for SENT/PARTIALLY_PAID/OVERDUE invoices
- Per-invoice override: invoice detail page can assign a different sequence or disable reminders
- Reminder history visible on invoice detail ("Reminders" tab)
- Reminders continue until paid regardless of whether invoice has been viewed

---

### E3: Scheduled Report Delivery

**Purpose:** Email reports on a recurring cadence to stakeholders.

**Data model:**
- New `ScheduledReport` model: `organizationId`, `reportType` (enum: P&L, aging, unpaid, expenses, tax_liability), `frequency` (weekly | monthly | quarterly), `dayOfWeek` (Int? for weekly), `dayOfMonth` (Int? for monthly), `recipients` (String[] — email addresses), `enabled`, `lastSentAt`

**Behavior:**
- Settings page: `/settings/reports` — create/edit scheduled deliveries
- Pick report type, frequency, recipients
- Inngest cron (daily check): find reports due today based on frequency/day config
- Generate report as PDF (reuse existing report + PDF generation)
- Email via Resend to all recipients with PDF attachment
- Log `lastSentAt`
- BCC owner respects existing preference

---

## Group F — Security

### F1: Two-Factor Authentication (2FA/MFA)

**Purpose:** TOTP-based 2FA using Supabase Auth's built-in MFA support.

**Data model:**
- No new Prisma models — Supabase handles MFA state in `auth.mfa_factors` and `auth.mfa_challenges`
- Add to Organization: `require2FA` (Boolean, default false) — org-level enforcement

**Behavior:**
- User settings: "Enable Two-Factor Authentication" section
  - Enrollment flow: show QR code (TOTP), verify with 6-digit code, show recovery codes
  - Disable flow: verify current code, then unenroll
- Login flow: after password auth, if MFA enrolled, prompt for TOTP code
- Org enforcement: if `require2FA = true`, users without MFA are redirected to enrollment after login
- Recovery codes: displayed once at enrollment, user must save them
- Uses Supabase `auth.mfa.enroll()`, `auth.mfa.challenge()`, `auth.mfa.verify()` APIs
- Middleware checks AAL (Authenticator Assurance Level) — requires AAL2 when MFA is enrolled

---

## Feature Summary

| # | Feature | Group | New Models | Complexity |
|---|---------|-------|------------|------------|
| D1 | White-Label Portal Branding | D | Org fields only | Low |
| D2 | Invoice Templates / Themes | D | Org fields only | Medium |
| E1 | Bulk Operations | E | None | Medium |
| E2 | Auto-Reminder Escalation | E | ReminderSequence, ReminderStep, ReminderLog | High |
| E3 | Scheduled Report Delivery | E | ScheduledReport | Medium |
| F1 | Two-Factor Authentication | F | Org field only (Supabase handles MFA) | Medium |
