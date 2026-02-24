# LaPlante Web Development Invoices

A modern invoicing and business management SaaS — rebuilt from a legacy PHP application as a full-stack Next.js app.

## What it does

LWD Invoices helps freelancers and small agencies manage their business operations:

- **Invoicing** — Create, send, and manage invoices with line items, compound tax support, partial payments, and PDF generation
- **Client Portal** — Shareable, token-based portal where clients can view invoices, pay online, and approve estimates
- **Projects & Time Tracking** — Track projects, log time entries, and bill hours directly to invoices with configurable rounding intervals
- **Recurring Invoices** — Schedule automatic invoice generation (daily, weekly, monthly, yearly) via background jobs
- **Payments** — Stripe and PayPal gateway integration with webhook-based status updates
- **Expenses & Reports** — Track expenses and generate revenue/payment/unpaid reports
- **Support Tickets** — Internal ticket system with threaded discussions
- **Credit Notes** — Issue credits against invoices
- **Attachments** — File uploads via Vercel Blob storage
- **Audit Log** — Organization-scoped activity log for all mutations
- **REST API v1** — Bearer-token authenticated API for external integrations
- **Multi-tenancy** — Full organization isolation via Clerk; users can belong to multiple orgs

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

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Clerk account (for auth)

### Setup

```bash
cp .env.example .env
# Fill in required env vars (see .env.example for details)

npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `RESEND_API_KEY` | Resend API key for email |
| `GATEWAY_ENCRYPTION_KEY` | 64-char hex key for encrypting payment gateway credentials |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app |

Optional: `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` (recurring invoices), `BLOB_READ_WRITE_TOKEN` (file attachments), `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
