# Quality Improvements Design

**Goal:** Fix broken tests, add cron job test coverage, finish DRY refactor, add rate limiting, and improve accessibility on public pages.

## Task 1: Fix broken tests and TypeScript errors

Fix 2 failing `routers-dashboard.test.ts` tests and TS compile errors introduced by the Prisma 7.6.0 / Next.js 16.2.2 dependency update. Errors include removed `CANCELLED` enum value, removed `STANDARD` invoice type, and null safety in `pay/[token]/page.tsx`.

## Task 2: Inngest cron job tests for installment paths

Add unit tests for the installment-aware logic in overdue invoices, payment reminders, reminder sequences, and late fees. Test `getEffectiveDueDate` and the guard patterns that skip PARTIALLY_PAID invoices when the next installment isn't due yet. Focus on pure logic — no DB/email mocking needed.

## Task 3: Finish DRY refactor (team.ts, portal.ts, portal layout)

Convert 6 remaining inline `resend.emails.send()` calls to use the centralized `sendEmail()` service:
- `src/server/routers/team.ts` — 3 calls (team invites, module-level Resend singleton)
- `src/server/routers/portal.ts` — 2 calls (comment notifications, proposal signing)
- `src/app/portal/[token]/layout.tsx` — 1 call (invoice viewed notification)

## Task 4: Rate limiting on public endpoints

Install `@upstash/ratelimit` + `@upstash/redis`. Create `src/lib/rate-limiter.ts` with sliding window limiter. Apply via Next.js middleware on:
- `/portal/*` — 60 req/min per IP
- `/pay/*` — 30 req/min per IP
- `/api/webhooks/*` — 100 req/min per IP

Return 429 with `Retry-After` header. Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars.

## Task 5: Accessibility quick wins on public pages

Scope: portal and pay pages only (client-facing). Changes:
- Semantic landmarks (`<main>`, `<header>`, `<nav>`)
- `aria-label` on icon-only buttons
- Visible focus rings (`focus-visible:ring-2`)
- `sr-only` text on status badges
- Proper `<label>` associations on form inputs
