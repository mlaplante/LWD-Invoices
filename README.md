# LaPlante Web Development Invoices

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

A modern, open-source invoicing and business management application — rebuilt from a legacy PHP application as a full-stack Next.js SaaS with multi-tenant organization support.

**Perfect for freelancers, consultants, and small businesses who need professional invoicing, time tracking, and client management.**

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#setup)
  - [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Architecture Notes](#architecture-notes)
- [Self-Hosting Guide](#self-hosting-guide)
- [Contributing](#contributing)
- [License](#license)

## Features

### Invoicing
- Create invoices with multiple line items, discounts, and compound tax support
- PDF generation and email delivery via Resend
- Partial payments tracking
- Credit notes against invoices
- Recurring invoices (daily / weekly / monthly / yearly) via background jobs
- Multiple invoice types: SIMPLE, DETAILED, ESTIMATE, CREDIT_NOTE

### Client Portal
- Shareable token-based portal for clients to view invoices and estimates (no account required)
- Online payment via Stripe or PayPal directly from the portal
- Estimate approval workflow
- Client dashboard showing all invoices and payment history

### Payments
- Stripe and PayPal gateway integration
- Webhook-based status updates with idempotency
- Encrypted gateway credentials stored per-organization
- Support for multiple payment methods: STRIPE, PAYPAL, BANK_TRANSFER, CASH, CHECK, MONEY_ORDER
- **Smart Payment Nudges** — Automatic identification of reliable payers who skip pre-due reminders (80%+ on-time payment rate)

### Projects & Time Tracking
- Project management with milestones and tasks
- Time entry logging with configurable rounding intervals
- Built-in timers and timesheets
- Bill tracked hours directly to invoices
- Project templates for reuse

### Business Operations
- **Clients** — Full client management with contact details and payment history tracking
- **Reliable Payer Badge** — Visual indicator for clients with consistently on-time payments
- **Expenses** — Categorized expense tracking with suppliers and file attachments
- **Reports** — Revenue, payment, and unpaid invoice reports
- **Year-End Export Pack** — Financial reports for accountants (P&L, Expense Ledger, Payment Ledger, Tax Liability) with CSV, PDF, and ZIP downloads
- **Support Tickets** — Internal ticket system with threaded discussions
- **Items** — Saved line item library for quick invoice creation
- **Currencies** — Multi-currency support
- **Taxes** — Configurable tax rates with compound tax support

### Platform
- **Multi-tenancy** — Full organization isolation via Supabase Auth; users can belong to multiple organizations
- **Authentication** — Supabase Auth with support for email/password and optional MFA (TOTP)
- **Global Search** — Command palette with Cmd+K (or Ctrl+K) for quick navigation across invoices, clients, projects, expenses, and tickets
- **Audit Log** — Organization-scoped activity log for all mutations
- **REST API v1** — Bearer-token authenticated API for external integrations (clients, invoices, projects)
- **File Attachments** — File uploads via Supabase Storage for invoices, expenses, and proposals
- **Notifications** — In-app and email notifications for invoice sends, payments, and overdue reminders
- **Onboarding** — Guided setup flow for new organizations
- **Background Jobs** — 10+ automated processes including recurring invoices, payment reminders, overdue notifications, late fees, and scheduled reports
- **Mobile Responsive** — Optimized layouts for mobile devices across all pages

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Auth | Supabase Auth (multi-tenant orgs) |
| API | tRPC v11 |
| Database | PostgreSQL + Prisma 7 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Email | Resend + React Email |
| PDF | @react-pdf/renderer |
| Payments | Stripe, PayPal |
| Background Jobs | Inngest |
| File Storage | Supabase Storage |
| Validation | Zod 4 |
| Testing | Vitest |
| Deployment | Netlify |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase or Neon recommended)
- Supabase account (for authentication and file storage)

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for admin operations) |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `RESEND_FROM_EMAIL` | From address for outgoing emails (e.g., `invoices@yourdomain.com`) |
| `GATEWAY_ENCRYPTION_KEY` | 64-char hex key for encrypting payment gateway credentials — generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (used for portal links and payment redirects) |

**Optional:**

| Variable | Description |
|---|---|
| `INNGEST_SIGNING_KEY` | Inngest signing key (required for background jobs like recurring invoices) |
| `INNGEST_EVENT_KEY` | Inngest event key |
| `STRIPE_SECRET_KEY` | Stripe secret key (if using Stripe payments) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `PAYPAL_CLIENT_ID` | PayPal client ID (if using PayPal payments) |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI-powered features) |

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
│   │   └── webhooks/    # Supabase, Stripe, and PayPal webhooks
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

- **Multi-tenancy** is enforced at the tRPC procedure layer using Supabase Auth's organization ID from user metadata. Every database query is scoped to the authenticated organization.
- **Background jobs** (recurring invoices, payment reminders, overdue notifications, late fees) run via Inngest and can be developed locally using the Inngest dev server.
- **Client portal** uses token-based access (no Supabase auth required) allowing clients to view and pay invoices without creating an account.
- **Payment gateway credentials** (Stripe keys, PayPal secrets) are encrypted at rest per-organization using AES-256-GCM with the `GATEWAY_ENCRYPTION_KEY`.

## Self-Hosting Guide

This application is designed to be self-hosted. Follow these steps for a complete installation:

### 1. Database Setup

Choose a PostgreSQL provider:
- **Supabase** (recommended): Provides database + authentication + file storage in one platform
- **Neon**: Serverless PostgreSQL with generous free tier
- **Self-hosted PostgreSQL**: Version 14+ required

Set your `DATABASE_URL` to the connection string provided by your database host.

### 2. Authentication Setup

This app uses **Supabase Auth** for user authentication and multi-tenant organization management.

**Steps:**
1. Create a Supabase project at https://supabase.com
2. In your Supabase dashboard → Settings → API:
   - Copy the **Project URL** → set as `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - Copy the **anon/public key** → set as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy the **service_role key** → set as `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)
3. Configure authentication providers in Settings → Authentication:
   - Enable Email provider
   - Optionally enable OAuth providers (Google, GitHub, etc.)
4. Set up MFA (optional): Enable TOTP in Settings → Authentication → Multi-Factor Authentication

**Important:** The app stores the user's organization ID in Supabase user metadata (`app_metadata.organizationId`). This is automatically set during onboarding.

### 3. File Storage Setup

The app uses **Supabase Storage** for file attachments (invoices, expenses, proposals).

**Steps:**
1. In your Supabase dashboard → Storage
2. Create the following buckets:
   - `invoices` — for invoice attachments
   - `expenses` — for expense receipts
   - `logos` — for organization logos
   - `proposals` — for proposal files
3. Set appropriate RLS (Row Level Security) policies for each bucket to ensure organization isolation

### 4. Email Delivery

Email is required for sending invoices, payment receipts, and reminders.

**Steps:**
1. Sign up at https://resend.com
2. Add and verify your sending domain
3. Create an API key → set as `RESEND_API_KEY`
4. Set your from email address → `RESEND_FROM_EMAIL` (e.g., `invoices@yourdomain.com`)

### 5. Payment Gateway Setup (Optional)

Configure payment gateways to accept online payments:

**Stripe:**
1. Create account at https://stripe.com
2. Get API keys from Dashboard → Developers → API keys
3. Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. Set up webhook endpoint at `https://yourdomain.com/api/webhooks/stripe`
5. Copy webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

**PayPal:**
1. Create account at https://developer.paypal.com
2. Create REST API app
3. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
4. Set up webhook endpoint at `https://yourdomain.com/api/webhooks/paypal`

### 6. Background Jobs Setup

Background jobs handle recurring invoices, payment reminders, and automated workflows.

**Steps:**
1. Sign up at https://inngest.com (free tier available)
2. Create a new app
3. Get signing key and event key from dashboard
4. Set `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`
5. Configure webhook endpoint: `https://yourdomain.com/api/inngest`

For local development, use the Inngest Dev Server:
```bash
npx inngest-cli@latest dev
```

### 7. Security Configuration

Generate encryption key for sensitive data:
```bash
openssl rand -hex 32
```
Set the output as `GATEWAY_ENCRYPTION_KEY` (this encrypts payment gateway credentials).

### 8. Deploy

**Netlify (recommended):**
1. Connect your GitHub repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
3. Add all environment variables in Site Settings → Environment Variables
4. Enable Netlify Next.js plugin (automatically detected)

**Alternative platforms:**
- **Vercel**: Native Next.js support with zero configuration
- **Docker**: Build container with `docker build -t lwd-invoices .`
- **VPS/Server**: Run `npm run build && npm start` behind a reverse proxy (nginx/caddy)

### 9. Post-Deployment Configuration

After deployment:

1. **Update webhook URLs** in:
   - Supabase: Set auth webhook to `https://yourdomain.com/api/webhooks/supabase`
   - Stripe: Point to `https://yourdomain.com/api/webhooks/stripe`
   - PayPal: Point to `https://yourdomain.com/api/webhooks/paypal`
   - Inngest: Point to `https://yourdomain.com/api/inngest`

2. **Verify email deliverability**: Send a test invoice to confirm Resend is working

3. **Test payment flow**: Create a test invoice and complete payment via Stripe/PayPal test mode

4. **Set up monitoring**: Monitor logs and set up alerts for failed background jobs

### System Requirements

- **Runtime**: Node.js 20+
- **Database**: PostgreSQL 14+ (10GB storage recommended for production)
- **Memory**: 512MB minimum, 1GB recommended
- **Storage**: 5GB for file attachments (scales with usage)

### Cost Estimation (Monthly)

For a small business (< 100 invoices/month):
- Database (Supabase/Neon): $0-25
- Email (Resend): $0-10 (up to 3,000 emails)
- Background Jobs (Inngest): $0 (free tier)
- Hosting (Netlify): $0-20
- File Storage: $0-5
- **Total: $0-60/month**

### Troubleshooting

**Database connection errors:**
- Verify `DATABASE_URL` is correct and database is accessible
- Check firewall rules allow connections from your hosting provider

**Authentication not working:**
- Verify all Supabase environment variables are set correctly
- Check that redirect URLs are configured in Supabase dashboard

**File uploads failing:**
- Verify Supabase Storage buckets exist and have correct RLS policies
- Check service role key has admin access

**Background jobs not running:**
- Verify Inngest webhook is configured and accessible
- Check Inngest dashboard for job execution logs

**Email not sending:**
- Verify domain is verified in Resend dashboard
- Check API key permissions and rate limits

## Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

**Quick Start:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit: `git commit -m "feat: add new feature"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a pull request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:
- Code style and conventions
- Testing requirements
- Pull request process
- Commit message format

## Support

- **Documentation**: Check the [Self-Hosting Guide](#self-hosting-guide) above
- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/mlaplante/LWD-Invoices/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/mlaplante/LWD-Invoices/discussions)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/), [tRPC](https://trpc.io/), and [Prisma](https://www.prisma.io/)
- Authentication powered by [Supabase](https://supabase.com/)
- Email delivery by [Resend](https://resend.com/)
- Background jobs by [Inngest](https://www.inngest.com/)

---

**Made with ❤️ for freelancers and small businesses**
