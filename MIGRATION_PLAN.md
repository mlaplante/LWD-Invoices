# Pancake → Modern SaaS Migration Plan

## Context

Pancake is a mature, self-hosted invoicing platform (CodeIgniter 3 / PHP / MySQL / jQuery 1.x).
The goal is a **full rewrite** as a modern, multi-tenant SaaS product with a fresh UI redesign,
keeping 100% of existing features. The new app will be hosted for multiple clients (multi-tenancy required).

Codebase complexity summary (from analysis):
- 734 PHP files, 57 database tables, 25 feature modules
- HIGH complexity: invoice tax system, partial payments, time tracking
- MEDIUM-HIGH: payment gateways (10 integrations), project management
- MEDIUM: client portal, email templates, reports, auth/permissions

---

## Recommended Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | **Next.js 15 App Router** + TypeScript | Full-stack TS, server components, API routes in one repo |
| ORM | **Prisma** | Type-safe DB layer with built-in migrations |
| Database | **PostgreSQL** (Supabase or Neon) | RLS for multi-tenancy, better window functions, jsonb, UUIDs |
| Auth | **Clerk** | Org-based multi-tenancy built in, MFA, SSO, webhooks |
| Internal API | **tRPC** | End-to-end type safety between UI and server logic |
| Payments | **Stripe** (primary) + **PayPal** + manual methods | Stripe covers 90% of use cases; preserve existing gateway parity |
| Email | **Resend** + **React Email** | Type-safe React templates replace Mustache; excellent deliverability |
| PDF | **Puppeteer** (headless Chrome) | Pixel-accurate PDFs from HTML; more reliable than DOMpdf |
| Background Jobs | **Inngest** | Serverless-friendly scheduler for recurring invoices; great UI |
| File Storage | **Cloudflare R2** or **S3** | Object storage for uploads, PDF cache |
| UI | **shadcn/ui** + **Tailwind CSS** | Industry-standard SaaS components; fully accessible |
| Testing | **Vitest** + **Playwright** | Unit tests + end-to-end |

---

## Architecture Overview

```
Next.js App (App Router)
├── /app
│   ├── (auth)/          - Clerk auth pages
│   ├── (dashboard)/     - Admin/staff workspace
│   │   ├── invoices/
│   │   ├── clients/
│   │   ├── projects/
│   │   ├── timesheets/
│   │   ├── reports/
│   │   └── settings/
│   ├── portal/[token]/  - Client portal (Kitchen replacement)
│   └── api/
│       ├── trpc/        - tRPC router (internal)
│       ├── v1/          - Public REST API (preserving existing API contracts)
│       ├── webhooks/    - Stripe / PayPal / Clerk webhooks
│       └── pdf/         - PDF generation endpoint
│
├── prisma/
│   ├── schema.prisma    - Full database schema
│   └── migrations/      - Migration history
│
├── src/
│   ├── server/          - tRPC routers, server-only logic
│   │   ├── routers/
│   │   ├── services/    - Business logic (invoices, payments, taxes)
│   │   └── jobs/        - Inngest job definitions
│   ├── components/      - shadcn/ui + custom components
│   ├── emails/          - React Email templates
│   └── lib/             - Utilities, formatting, currency
```

**Multi-tenancy model:** Each Clerk Organization = one business. All database tables include
`organization_id`. PostgreSQL RLS policies enforce that queries only return rows matching
the current user's org — replacing the CodeIgniter `business_identities` pattern.

---

## Phase 1 — Foundation (Weeks 1–8)

**Goal:** Working app shell with auth, DB, and core data models.

### Deliverables
- [ ] Next.js 15 project with TypeScript, Tailwind, shadcn/ui
- [ ] Clerk authentication (sign up, sign in, org creation, invites)
- [ ] PostgreSQL schema for core entities (see below)
- [ ] tRPC setup with Clerk auth middleware
- [ ] CI/CD pipeline (GitHub Actions → Vercel/Railway)
- [ ] Prisma migrations from day one

### Database Schema (Core)
Map from Pancake MySQL → PostgreSQL. Key decisions:
- `BIGINT AUTO_INCREMENT` → `UUID` (Prisma default, better for distributed systems)
- `varchar unique_id` → retained as `slug` for URL-safe identifiers
- `TINYINT(1)` booleans → native `BOOLEAN`
- `TEXT` for JSON blobs → `jsonb` (pauses_json, gateway config, meta)
- All timestamps → `TIMESTAMPTZ` (timezone-aware)
- Status strings → PostgreSQL `ENUM` types

Core tables to create in Phase 1:
```
organizations, users, clients, currencies, taxes,
business_identities, items (reusable invoice items)
```

### Key Reference Files (Pancake)
- Schema: `pancake/installer/schema/pancake.sql`
- Config: `system/pancake/config/database.php`
- Base model: `system/pancake/core/Pancake_Model.php`

---

## Phase 2 — Core Invoicing (Weeks 9–18)

**Goal:** Feature-complete invoice management with PDF and email.

### Deliverables
- [ ] Invoice CRUD (create, edit, duplicate, archive, delete)
- [ ] Invoice types: DETAILED, SIMPLE, ESTIMATE, CREDIT_NOTE
- [ ] Line items with quantity, rate, description, discount (fixed or %)
- [ ] Multi-tax system: multiple taxes per line item, compound tax support
- [ ] Invoice PDF generation (Puppeteer, cached in R2/S3)
- [ ] Send invoice via email (React Email templates, Resend)
- [ ] Invoice status machine: draft → sent → partially_paid → paid → overdue
- [ ] Partial payments: fixed amount and percentage splits
- [ ] Multi-currency with exchange rates
- [ ] View tracking (client opened email/portal)

### Critical Business Logic to Preserve (HIGH RISK)
The compound tax calculation from `invoice_rows_taxes`:
```typescript
// Tax-on-tax support: some taxes apply to (subtotal + previous taxes)
// Discount applies before or after tax depending on invoice settings
// Partial payment percentages must recalculate per-payment tax amounts
// Exchange rate stored at time of invoice creation, not live rate
```

### React Email Templates to Build
1. Invoice / Estimate sent
2. Payment received / receipt
3. Payment reminder
4. Overdue notice
5. Client portal access link

### Key Reference Files (Pancake)
- Invoice model: `system/pancake/modules/invoices/models/invoice_m.php` (6,272 lines)
- Partial payments: `system/pancake/modules/invoices/models/partial_payments_m.php`
- PDF helper: `system/pancake/helpers/pancake_helper.php` (lines 1090–1195)
- Email model: `system/pancake/modules/emails/models/emails_m.php`

---

## Phase 3 — Payments & Client Portal (Weeks 19–26)

**Goal:** Payment processing and client-facing portal.

### Deliverables
- [ ] Stripe integration (card payments, SCA/3DS, webhooks)
- [ ] PayPal integration
- [ ] Manual methods: bank transfer, cash, check, money order
- [ ] Payment surcharge support (percentage or fixed per gateway)
- [ ] Stored payment tokens for recurring billing
- [ ] Client portal (`/portal/[clientToken]`) with optional passphrase
- [ ] Portal: view invoices, estimates, proposals, project status
- [ ] Portal: comment on invoices/projects
- [ ] Portal: file uploads on comments
- [ ] Portal: one-click pay via Stripe/PayPal

### Multi-tenancy for Payments
Each org configures their own Stripe/PayPal keys → stored encrypted in `gateway_settings` table.
Use Stripe Connect or separate API key per org.

### Key Reference Files (Pancake)
- Gateway base: `system/pancake/modules/gateways/` (1,819 lines total)
- Kitchen portal: `system/pancake/modules/kitchen/` (1,214 lines)
- Payments gateway config: `system/pancake/config/oneoff_payment.php`

---

## Phase 4 — Projects & Time Tracking (Weeks 27–36)

**Goal:** Full project management and time billing.

### Deliverables
- [ ] Project CRUD with client association, currency, projected hours
- [ ] Hierarchical tasks (parent/child) with milestones
- [ ] Task statuses (custom per-org)
- [ ] Project templates with auto-task generation
- [ ] Real-time timer (start/pause/resume/stop) — WebSocket or SSE
- [ ] Time entry logging with billable/non-billable flag
- [ ] **Rounding algorithm** (CRITICAL — must match exactly):
  ```typescript
  // From Pancake source:
  // CEILING(round(minutes) / task_time_interval) * task_time_interval
  const roundedMinutes = Math.ceil(Math.round(minutes) / interval) * interval;
  ```
- [ ] Timesheet views (by user, by project, by date range)
- [ ] Bill time to invoices (mark `invoice_item_id` on time entries)
- [ ] Expense tracking (categories, suppliers, amounts)
- [ ] Milestone management with colors and target dates

### Key Reference Files (Pancake)
- Task model: `system/pancake/modules/projects/models/project_task_m.php` (1,173 lines)
- Timer model: `system/pancake/modules/projects/models/project_timers_m.php`
- Time model: `system/pancake/modules/projects/models/project_time_m.php`
- Timesheet model: `system/pancake/modules/timesheets/models/timesheet_m.php`

---

## Phase 5 — Business Features (Weeks 37–44)

**Goal:** Complete the full feature set.

### Deliverables
- [ ] Recurring invoices via Inngest (daily cron, frequency: day/week/month/year)
- [ ] Proposals/estimates with accept/decline workflow
- [ ] Reports: unpaid, overdue, payments by gateway, expense breakdown
- [ ] Support ticket system
- [ ] Notifications (in-app + email)
- [ ] Credit notes with application to invoices
- [ ] File management (uploads linked to invoices/projects/clients)
- [ ] Discussion threads
- [ ] Activity/audit log
- [ ] Public REST API v1 (preserve existing endpoint contracts)
  - 37 endpoints: invoices, projects, tasks, users, clients, settings, store

### Inngest Job: Recurring Invoices
```typescript
// Runs daily, finds invoices due for recurrence
// Generates new invoice, optionally auto-sends
// Handles frequency parsing from stored config
```

---

## Phase 6 — Data Migration & Launch (Weeks 45–52)

**Goal:** Migrate live data and cut over.

### Data Migration Script
1. Export all 57 MySQL tables to JSON
2. Transform: integer IDs → UUIDs (maintain mapping table for FK resolution)
3. Transform: compound taxes → new schema
4. Transform: gateway_fields key-value → jsonb config objects
5. Import to PostgreSQL with validation
6. Verify row counts and spot-check critical records

### Migration Order (dependency-aware)
```
1. currencies, taxes, organizations/business_identities
2. users, groups, permissions
3. clients, clients_taxes, clients_meta
4. items
5. invoices, invoice_rows, invoice_rows_taxes
6. partial_payments
7. projects, project_milestones, project_tasks
8. project_times, project_timers
9. project_expenses
10. proposals
11. tickets
12. files, discussions, notifications
```

### Cutover Plan
1. Put Pancake in read-only mode (disable new invoice creation)
2. Run final migration
3. Verify data integrity
4. DNS/domain switch
5. Monitor for 48 hours
6. Archive old server

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Foundation | 8 weeks | 8 weeks |
| Core Invoicing | 10 weeks | 18 weeks |
| Payments & Portal | 8 weeks | 26 weeks |
| Projects & Time | 10 weeks | 36 weeks |
| Business Features | 8 weeks | 44 weeks |
| Migration & Launch | 8 weeks | 52 weeks |

**Solo developer:** ~12–18 months
**2-person team:** ~8–10 months

---

## Highest-Risk Items

1. **Compound tax calculations** — Must write unit tests against known Pancake output values
2. **Time rounding algorithm** — Extract and unit test immediately; billing accuracy depends on it
3. **Partial payment percentage logic** — Edge cases with currencies and tax splits
4. **10 payment gateway integrations** — Prioritize Stripe, PayPal, and manual; add others incrementally
5. **Data migration** — Integer ID → UUID FK remapping is error-prone; validate thoroughly

---

## Verification Plan

- Unit test all tax calculation logic against Pancake's known outputs before cutover
- Unit test time rounding algorithm with real timesheet data
- E2E test (Playwright): full invoice create → send → pay → mark paid flow
- E2E test: recurring invoice generation via Inngest
- Load test: reports with large dataset (simulate years of invoice data)
- Parallel run: both systems active for 2–4 weeks with read-only sync checks
