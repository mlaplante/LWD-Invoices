---
name: lwd-config-and-flags
description: Use when adding, renaming, rotating, or debugging an environment variable or feature flag in LWD Invoices — symptoms include "process.env.X is undefined", a Zod env validation error on boot ("Invalid environment variables"), Netlify build failing on env checks, a new AI provider/model env var not taking effect, GATEWAY_ENCRYPTION_KEY / PORTAL_SESSION_SECRET rotation, questions about which AI provider (Gemini/OpenAI/Anthropic) a feature uses or its fallback model chain, or an env var present in .env.example / README but seemingly having no effect in code.
---

# LWD Config and Flags

## Overview

Config lives in three places that must move together: `.env.example` (human docs), `src/lib/env.ts`
(the `@t3-oss/env-nextjs` + Zod schema — the only *validated* source of truth), and scattered raw
`process.env.X` reads that bypass the schema entirely. A flag that exists in code but not in
`.env.example`/`env.ts` will silently no-op in production with no error — nobody will know to set it.
That is the failure mode this skill exists to catch.

## When to use / When NOT to use

Use this skill when you are: adding a new env var, changing a default, debugging "why isn't my env
var doing anything," rotating `GATEWAY_ENCRYPTION_KEY`, or figuring out which AI provider/model a
given feature resolves to.

Do NOT use this skill for:
- **Encryption/keyring internals and rotation mechanics** (the actual crypto, envelope format) →
  `lwd-security-and-secrets`.
- **`SKIP_ENV_VALIDATION`, `next build`, Netlify build command, CI env matrix** → `lwd-build-and-env`.
- **Org-scoping / `ctx.orgId` correctness** (a config concern only insofar as it's a non-negotiable,
  not an env-var concern) → `lwd-architecture-contract`.
- **AI eval-suite mechanics** (golden sets, critical-case veto, `npm run test:eval`) → this skill only
  tells you which env var selects a provider/model, not how the eval gate works.
- **Deploy/ops runbook** (Netlify dashboard, secrets management in production) → `lwd-run-and-operate`.

## The three tiers of config, and why the tier matters

| Tier | Defined in | Validated? | Undocumented = | Example |
|---|---|---|---|---|
| 1. Schema-validated | `src/lib/env.ts` (`server`/`client` blocks) | Yes — Zod throws `Invalid environment variables` at import time unless `SKIP_ENV_VALIDATION` is set | Build/boot fails loudly | `DATABASE_URL`, `GATEWAY_ENCRYPTION_KEY` |
| 2. Raw `process.env.X`, documented | Read directly in a service/route, but listed in `.env.example` | No — typos or omissions fail silently | Feature silently degrades (e.g. no rate limiting) | `WARMUP_SECRET` |
| 3. Raw `process.env.X`, undocumented | Read directly, **not** in `.env.example` or `env.ts` | No | Nobody outside the code knows it exists | `UPSTASH_REDIS_REST_URL/TOKEN`, `GEMINI_MODELS`, `OPENAI_MODEL` |

Tier 3 is the dangerous one — verified present in this repo today (2026-07-05):

```bash
# Find every process.env.X read in src/, then diff against every var name
# mentioned in .env.example (commented-out examples count as "documented").
# Uses [[:space:]] (not \s) and sed -E for BSD/macOS sed portability.
comm -23 \
  <(grep -rhoE 'process\.env\.[A-Z0-9_]+' src --include="*.ts" --include="*.tsx" \
      | sed 's/process\.env\.//' | sort -u) \
  <(grep -ohE '^#?[[:space:]]*[A-Z0-9_]+' .env.example \
      | sed -E 's/^#[[:space:]]*//' | sort -u)
```

Confirmed tier-3 vars as of this writing:
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — `src/lib/rate-limiter.ts`. Powers the
  Upstash sliding-window rate limiter used by `src/proxy.ts` to throttle the portal, pay, webhook,
  v1 API, and AI endpoints at the edge. **If unset, `getRateLimiters()` returns `null` and the proxy
  silently skips rate limiting** — this is fine in dev/test but is a real gap if forgotten in
  production. Not in `.env.example`, not in `env.ts`.
- `GEMINI_MODELS` — `src/server/routers/reports.ts` (`weeklyBriefing`). A *different* Gemini
  model-fallback var from `GEMINI_CASHFLOW_MODELS`/`GEMINI_AGENT_MODELS`/etc.; defaults to
  `["gemini-2.0-flash", "gemini-1.5-flash"]` if unset. Not in `.env.example`, not in `env.ts`.
- `OPENAI_MODEL` — `src/server/services/cash-flow-insights.ts` (OpenAI fallback path of the
  cash-flow narrative), default `"gpt-4.1-mini"`. Distinct from `OPENAI_REMINDER_MODEL` and
  `OPENAI_INVOICE_PARSER_MODEL`, which ARE in `env.ts`. Not in `.env.example`.
- `PORT` / `URL` — `src/trpc/client.tsx`, used to build the tRPC client's base URL
  (`process.env.URL` = Netlify's injected deploy URL). These are platform-provided at runtime, not
  something you set by hand — informational only, don't add them to `.env.example`.

**Stale-doc warning (verified against code, not to be trusted as-is):** README.md's Environment
Variables table and its "Payment Gateway Setup" section (`README.md` around line 291) list
`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` as env vars to set. **They are never read via
`process.env` anywhere in `src/`.** Payment gateway credentials are actually per-organization,
entered through the Settings UI (`src/components/settings/GatewaySettingsForm.tsx` →
`src/server/routers/gatewaySettings.ts`), encrypted at rest with `encryptJson()`
(`src/server/services/encryption.ts`, keyed by `GATEWAY_ENCRYPTION_KEY`/`GATEWAY_ENCRYPTION_KEYS`),
and stored per-org in the DB — see the `organizationId` scoping in `gatewaySettings.ts`. If you're
setting up Stripe/PayPal for a deployment, use the in-app Settings page, not env vars. Fix the README
if you touch this area; don't propagate the stale instructions.

## Required env vars (Tier 1 — validated, no default, missing = build/boot fails)

Verified in `src/lib/env.ts` `server`/`client` blocks (no `.default(...)`):

| Var | Zod check |
|---|---|
| `DATABASE_URL` | `z.string().url()` |
| `RESEND_API_KEY` | `z.string().min(1)` |
| `SUPABASE_URL` | `z.string().url()` |
| `SUPABASE_SERVICE_ROLE_KEY` | `z.string().min(1)` |
| `NEXT_PUBLIC_SUPABASE_URL` | `z.string().url()` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `z.string().min(1)` |

Two more vars have a `.default(...)` so they're technically optional but should always be set
deliberately in production: `RESEND_FROM_EMAIL` (defaults `invoices@example.com`) and
`NEXT_PUBLIC_APP_URL` (defaults `http://localhost:3000` — wrong in production: portal links and
payment redirects will point at localhost).

`GATEWAY_ENCRYPTION_KEY` is declared `.optional()` in the schema but has a `.refine()` that throws
**"GATEWAY_ENCRYPTION_KEY (or GATEWAY_ENCRYPTION_KEYS) is required in production"** when
`NODE_ENV === "production"` and neither var is set. Same pattern for `INNGEST_SIGNING_KEY` (required
in production only — without it "the Inngest SDK accepts unsigned requests, letting anyone who finds
`/api/inngest` trigger scheduled jobs," per the code comment). Generate both with
`openssl rand -hex 32` (64 hex chars).

## Optional but important (Tier 1, validated when present)

| Var | Purpose | Notes |
|---|---|---|
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` | Background jobs (recurring invoices, reminders, dunning) | Signing key required in prod (see above) |
| `PORTAL_SESSION_SECRET` | Dedicated HMAC secret for public client-portal session cookies (`min(32)`) | Falls back to `SUPABASE_SERVICE_ROLE_KEY` if unset (`src/lib/portal-session.ts`) — set this in prod so rotating the service-role key doesn't also invalidate/leak portal-cookie signing, and vice versa |
| `GATEWAY_ENCRYPTION_KEYS` | Keyring for key rotation: `"k2:<64-hex>,k1:<64-hex>"` | First entry encrypts new secrets; every entry can decrypt old ones. Full rotation mechanics → `lwd-security-and-secrets` |
| `RESEND_WEBHOOK_SECRET` | Verifies `/api/webhooks/resend` delivery/open/click events | Optional; unset = webhook endpoint just won't verify/store those events |
| `RESEND_INBOUND_DOMAIN` + `RESEND_INBOUND_WEBHOOK_SECRET` | Inbound email threading (client replies → invoice/ticket) | Both needed together |
| `WARMUP_SECRET` | Shared secret checked by `/api/warmup` (`src/app/api/warmup/route.ts`) against an `x-warmup-secret` header | **Tier 2**: read via raw `process.env`, not in `env.ts`. Only enforced when `NODE_ENV === "production"`; if unset in prod the route 404s for everyone (fails closed, not open) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Edge rate limiting | **Tier 3**, see above — set both in prod or rate limiting is silently off |

## AI provider precedence and model-fallback flags

Every AI feature independently checks `GEMINI_API_KEY` first; if present it runs an **ordered Gemini
model list with 429 (rate-limit/quota) fallback** — first model fails with 429, next model in the
list is tried. If `GEMINI_API_KEY` is unset, precedence falls through to OpenAI, then (for a few
features) Anthropic. A per-feature `*_AI_PROVIDER` var pins one provider explicitly, bypassing the
auto-detect. Verified against the service files (each declares its own default model array — all
identical today: `["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"]`):

| Feature | Provider-pin var | Model-override var | Default Gemini chain | Service file |
|---|---|---|---|---|
| "Ask your books" assistant | `ASSISTANT_AI_PROVIDER` (`gemini`\|`anthropic`) | `GEMINI_AGENT_MODELS`; Anthropic path uses `ANTHROPIC_AGENT_MODEL` (default `claude-opus-4-8`) | gemini-2.0/2.5/1.5-flash | `src/server/services/books-assistant.ts` |
| Receipt OCR | `RECEIPT_OCR_PROVIDER` (`openai`\|`anthropic`\|`gemini`) | `GEMINI_OCR_MODELS` | same | `src/server/services/receipt-ocr.ts` |
| NL invoice drafting | `INVOICE_PARSER_PROVIDER` (`openai`\|`gemini`) | `GEMINI_INVOICE_PARSER_MODELS`; `OPENAI_INVOICE_PARSER_MODEL` | same | `src/server/services/natural-language-invoice.ts` |
| Smart reminder drafts | `REMINDER_AI_PROVIDER` (`openai`\|`gemini`) | `GEMINI_REMINDER_MODELS`; `OPENAI_REMINDER_MODEL` | same | `src/server/services/smart-reminder-drafts.ts` |
| Cash-flow narrative | *(no pin var — always Gemini→OpenAI→deterministic)* | `GEMINI_CASHFLOW_MODELS`; `OPENAI_MODEL` (Tier 3, undocumented) | same | `src/server/services/cash-flow-insights.ts` |
| Invoice reviewer (unclear line desc) | `INVOICE_REVIEW_AI_PROVIDER` (`openai`\|`anthropic`\|`gemini`) | `GEMINI_INVOICE_REVIEW_MODELS` | same | `src/server/services/invoice-review.ts` |
| Expense categorization (new/ambiguous supplier fallback) | `EXPENSE_CATEGORY_AI_PROVIDER` (`openai`\|`anthropic`\|`gemini`) | `GEMINI_EXPENSE_CATEGORY_MODELS` | same | `src/server/services/expense-categorization.ts` |
| Proposal generator | `PROPOSAL_AI_PROVIDER` (`openai`\|`anthropic`\|`gemini`) | `GEMINI_PROPOSAL_MODELS` | same | `src/server/services/proposal-generator.ts` |
| Month-end close narrative | *(no pin var — always Gemini→Anthropic, no OpenAI path)* | reuses `GEMINI_AGENT_MODELS`/`ANTHROPIC_AGENT_MODEL` | same | `src/server/services/month-end-close.ts` |
| Weekly briefing report | *(no pin var)* | `GEMINI_MODELS` (Tier 3, undocumented; default differs: `["gemini-2.0-flash","gemini-1.5-flash"]`, no 2.5) | see note | `src/server/routers/reports.ts` |

**Privacy caveat (verbatim from `.env.example`):** "Gemini has a free API tier (note: free-tier data
may be used by Google to improve their products — review before sending sensitive data)." Don't route
sensitive client financial data through a free-tier Gemini key without checking this with whoever owns
that decision.

**Never contradicts non-negotiable #3**: none of these vars change what number gets billed or paid —
LLMs here only narrate/draft/categorize. If a change to one of these vars appears to be trying to make
an LLM "calculate" a total, stop — that's an architecture violation, not a config change. See
`invoicing-domain-reference` / `lwd-architecture-contract`.

## How to add a new env var (checklist)

1. **Add it to `.env.example`** with a comment explaining what it does, whether it's required, and
   (if a secret) how to generate it, e.g. `openssl rand -hex 32`. Put it in the right section
   (Database / Supabase / Email / Application / Security / Background Jobs / Payment Gateways / AI).
2. **Add it to `src/lib/env.ts`**:
   - Add a Zod field in `server` (server-only secret) or `client` (must be prefixed `NEXT_PUBLIC_` —
     Next.js only inlines that prefix client-side).
   - If it must be non-empty only in production (like `INNGEST_SIGNING_KEY`), use
     `.optional().refine((val) => process.env.NODE_ENV !== "production" || !!val, "<message>")`
     rather than a bare `.min(1)` — otherwise local dev without the var breaks.
   - Add the matching line to the `runtimeEnv` object (both blocks must agree — `createEnv` throws if
     a declared field has no `runtimeEnv` entry).
3. **Consume it via `import { env } from "@/lib/env"`**, not a raw `process.env.X` read — the whole
   point of tier 1 is fail-fast validation. Only reach for raw `process.env.X` where `env.ts` genuinely
   can't be imported (e.g. `src/lib/portal-session.ts` notes it reads directly "so this module stays
   free of next/env wrappers and remains importable from edge/server code paths" — that's a deliberate,
   documented exception, not a default).
4. **If required in production, add a placeholder to the CI build step** (`.github/workflows/ci.yml`,
   `build` job `env:` block) — the comment there explains: "static prerendering instantiates Supabase
   clients at build time, but no real services are contacted." Only the vars actually read at
   *build/prerender* time need placeholders there.
5. **Re-verify nothing drifted:**
   ```bash
   # Same var name declared in both the Zod schema block and runtimeEnv?
   grep -c '<YOUR_VAR>' src/lib/env.ts   # expect 2 (schema + runtimeEnv) — or 3 with a client mirror

   # Is it documented in .env.example?
   grep '<YOUR_VAR>' .env.example

   # Does the README's Environment Variables table need updating too?
   grep -n '<YOUR_VAR>' README.md
   ```
6. If it's a keyring/rotation-style secret, cross-check the rotation procedure comment in
   `src/server/services/encryption.ts` and `lwd-security-and-secrets` before inventing a new pattern —
   reuse the `"<keyId>:<hex>,..."` convention already established by `GATEWAY_ENCRYPTION_KEYS`.

## Common mistakes

- **Reading `process.env.X` directly for something that should be schema-validated.** It silently
  returns `undefined` on a typo; `env.ts` throws `Invalid environment variables` immediately. New tier-3
  vars are how `UPSTASH_REDIS_REST_URL`/`GEMINI_MODELS`/`OPENAI_MODEL` ended up undocumented — don't
  add a fourth.
- **Declaring a field in the Zod `server`/`client` block but forgetting `runtimeEnv`.** `createEnv`
  will throw at startup; the fix is always "add the missing `runtimeEnv` line," not "remove validation."
- **Assuming Stripe/PayPal are configured via env vars** because README/.env.example say so — they are
  not; see the stale-doc warning above. Point users at the in-app Settings page instead.
- **Using `.min(1)` for a var that's only required in production** — breaks every contributor's local
  dev. Use the `.refine(... NODE_ENV !== "production" ...)` pattern instead (see `GATEWAY_ENCRYPTION_KEY`,
  `INNGEST_SIGNING_KEY` in `env.ts`).
- **Setting a `*_MODEL`/`*_MODELS` var and expecting it to change which *provider* is used.** Model
  vars only take effect once a provider is already selected (by `*_AI_PROVIDER` or the Gemini-first
  auto-detect) — setting `OPENAI_REMINDER_MODEL` does nothing if Gemini is already active for that
  feature.
- **Forgetting `NEXT_PUBLIC_APP_URL` in production.** It has a `localhost:3000` default that validates
  fine, so nothing errors — portal links and payment redirects just silently point at localhost.

## Provenance and maintenance

Verified 2026-07-05 by opening: `.env.example`, `src/lib/env.ts`, `next.config.ts`, `README.md`
(Environment Variables table + Self-Hosting §5 Payment Gateway Setup), `netlify.toml`, `package.json`,
`.github/workflows/ci.yml`, `src/app/api/warmup/route.ts`, `src/lib/rate-limiter.ts`,
`src/lib/portal-session.ts`, `src/server/services/encryption.ts`, `src/server/services/gateway-config.ts`,
`src/server/routers/gatewaySettings.ts`, `src/server/routers/reports.ts`,
`src/server/services/cash-flow-insights.ts`, `src/server/services/month-end-close.ts`,
`src/server/services/books-assistant.ts`, `src/server/services/receipt-ocr.ts`, `src/server/trpc.ts`,
plus a repo-wide `grep -rn "process.env"` sweep of `src/`.

Re-verify when this drifts:
```bash
# Full inventory of every env var actually read in code (source of truth):
grep -rhoE 'process\.env\.[A-Z0-9_]+' src --include="*.ts" --include="*.tsx" | sort -u

# Tier-3 finder: vars read in code but absent from .env.example (see the
# portable comm/sed form in "The three tiers of config" above):
comm -23 \
  <(grep -rhoE 'process\.env\.[A-Z0-9_]+' src --include="*.ts" --include="*.tsx" \
      | sed 's/process\.env\.//' | sort -u) \
  <(grep -ohE '^#?[[:space:]]*[A-Z0-9_]+' .env.example \
      | sed -E 's/^#[[:space:]]*//' | sort -u)

# Confirm the required/optional split in the schema itself:
grep -n "z.string()" src/lib/env.ts

# Confirm netlify.toml still runs migrations on deploy (non-negotiable #2):
grep -n "prisma migrate deploy" netlify.toml package.json

# Confirm Stripe/PayPal are still per-org DB config, not env vars (re-check the stale-doc claim):
grep -rn "STRIPE_SECRET_KEY\|PAYPAL_CLIENT_ID" --include="*.ts" --include="*.tsx" src
```
