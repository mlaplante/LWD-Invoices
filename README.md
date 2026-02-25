# LaPlante Web Development Invoices

A modern invoicing and business management app — rebuilt from a legacy PHP application as a full-stack Next.js SaaS with multi-tenant organization support.

## Features

### Invoicing
- Create invoices with multiple line items, discounts, and compound tax support
- PDF generation and email delivery via Resend
- Partial payments tracking
- Credit notes against invoices
- Recurring invoices (daily / weekly / monthly / yearly) via background jobs

### Client Portal
- Shareable token-based portal for clients to view invoices and estimates
- Online payment via Stripe or PayPal directly from the portal
- Estimate approval workflow

### Payments
- Stripe and PayPal gateway integration
- Webhook-based status updates with idempotency
- Encrypted gateway credentials stored per-organization

### Projects & Time Tracking
- Project management with milestones and tasks
- Time entry logging with configurable rounding intervals
- Timers and timesheets
- Bill tracked hours directly to invoices
- Project templates

### Business Operations
- **Clients** — Full client management with contact details
- **Expenses** — Categorized expense tracking with suppliers
- **Reports** — Revenue, payment, and unpaid invoice reports
- **Support Tickets** — Internal ticket system with threaded discussions
- **Items** — Saved line item library for quick invoice creation
- **Currencies** — Multi-currency support
- **Taxes** — Configurable tax rates

### Platform
- **Multi-tenancy** — Full organization isolation via Clerk; users can belong to multiple orgs
- **Audit Log** — Organization-scoped activity log for all mutations
- **REST API v1** — Bearer-token authenticated API for external integrations (clients, invoices, projects)
- **File Attachments** — File uploads via Vercel Blob storage
- **Notifications** — In-app and email notifications for invoice sends, payments, and overdue reminders
- **Onboarding** — Guided setup flow for new organizations

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Auth | Clerk (multi-tenant orgs) |
| API | tRPC v11 |
| Database | PostgreSQL + Prisma 7 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Email | Resend + React Email |
| PDF | @react-pdf/renderer |
| Payments | Stripe, PayPal |
| Background Jobs | Inngest |
| File Storage | Vercel Blob |
| Validation | Zod 4 |
| Testing | Vitest |
| Deployment | Netlify |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase or Neon recommended)
- Clerk account

### Setup

```bash
cp .env.example .env.local
# Fill in required env vars (see below)

npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

**Required:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook secret (from Clerk dashboard → Webhooks) |
| `RESEND_API_KEY` | Resend API key for email |
| `RESEND_FROM_EMAIL` | From address for outgoing emails |
| `GATEWAY_ENCRYPTION_KEY` | 64-char hex key for encrypting payment gateway credentials — generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (used for portal links and payment redirects) |

**Optional:**

| Variable | Description |
|---|---|
| `INNGEST_SIGNING_KEY` | Inngest signing key (required for recurring invoices) |
| `INNGEST_EVENT_KEY` | Inngest event key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `PAYPAL_CLIENT_ID` | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (required for file attachments) |

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests (watch mode)
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage report
npm run db:migrate   # Run pending database migrations
npm run db:seed      # Seed the database with sample data
npm run db:studio    # Open Prisma Studio
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Sign-in / sign-up pages
│   ├── (dashboard)/     # Main app UI (invoices, clients, projects, etc.)
│   ├── api/
│   │   ├── inngest/     # Inngest background job handler
│   │   ├── invoices/    # PDF generation endpoint
│   │   ├── portal/      # Token-based client portal API
│   │   ├── trpc/        # tRPC HTTP handler
│   │   ├── v1/          # REST API v1 (clients, invoices, projects)
│   │   └── webhooks/    # Clerk, Stripe, and PayPal webhooks
│   ├── onboarding/      # New org setup flow
│   └── portal/          # Public client portal pages
├── server/
│   ├── routers/         # tRPC routers (one per domain)
│   ├── services/        # Business logic and PDF generation
│   └── trpc.ts          # tRPC context and procedure builders
├── components/          # Shared UI components
├── emails/              # React Email templates
├── inngest/             # Background job function definitions
└── lib/                 # Utilities, env validation, auth helpers
prisma/
├── schema.prisma        # Database schema
└── migrations/          # Migration history
```

## Architecture Notes

- **Multi-tenancy** is enforced at the tRPC procedure layer using Clerk's `orgId`. Every database query is scoped to the authenticated organization.
- **Background jobs** (recurring invoices, payment reminders, overdue notifications) run via Inngest and can be developed locally using the Inngest dev server.
- **Client portal** uses token-based access (no Clerk auth required) allowing clients to view and pay invoices without creating an account.
- **Payment gateway credentials** (Stripe keys, PayPal secrets) are encrypted at rest per-organization using AES-256-GCM.
