---
name: lwd-security-and-secrets
description: Use when touching encryption/keyring code (src/server/services/encryption.ts, GATEWAY_ENCRYPTION_KEY/GATEWAY_ENCRYPTION_KEYS), rotating a secret, adding or debugging a webhook handler (src/app/api/webhooks/*, Stripe/Resend/svix signature errors, duplicate-processing symptoms), wiring a new file-upload/download path or Supabase storage bucket (signed URLs, "Unauthorized" on /api/attachments or /api/receipts/view), working on portal/pay session auth (src/lib/portal-session.ts, PORTAL_SESSION_SECRET, portal token enumeration, brute-force lockout), reviewing an IDOR/cross-tenant-access risk on any endpoint, or configuring rate limiting (src/lib/rate-limit.ts, src/lib/rate-limiter.ts, Upstash) or secret scanning (gitleaks, .github/workflows/gitleaks.yml).
---

# LWD Security and Secrets

## Overview

This app is a private multi-tenant SaaS holding client PII, contractor SSN/EINs, payment-gateway
credentials, and e-signatures. There is no single "security module" — security is a handful of small,
independently-testable mechanisms bolted onto ordinary routes: an AES-256-GCM keyring for secrets at
rest, an HMAC-signed cookie for portal sessions, short-lived signed URLs in front of private Supabase
buckets, provider-signature checks in front of every webhook, and a few rate limiters. This skill is
the map of those mechanisms: what they protect, how to extend them correctly, and how to rotate a key
without an outage.

The org-scoping/IDOR *mental model* (why `ctx.orgId` is the tenant boundary and what a missing filter
costs) lives in `lwd-architecture-contract` — this skill only teaches the *file-serving* IDOR pattern
(signed URLs + a path/DB ownership check), which is a security-specific variant of the same rule.

## When to use this / when NOT to use this

Use this skill for: encryption keyring rotation, portal session HMAC internals, signed-URL storage
IDOR guards, webhook signature verification + dedup, rate limiting as a security control, and secret
scanning.

Use a sibling instead for:
- **Org-scoping mechanism, `ctx.orgId`, `protectedProcedure`, the `reopen` leak as an architectural
  pattern** → `lwd-architecture-contract`.
- **The `reopen` leak told as a full incident narrative** → `lwd-failure-archaeology`.
- **The env-var catalog** (which vars exist, which tier, `.env.example` vs `env.ts`), including why
  `UPSTASH_REDIS_REST_URL/TOKEN` are undocumented Tier-3 vars → `lwd-config-and-flags`. This skill
  only tells you what those vars gate security-wise, not how the tiering works.
- **`githooks/pre-commit` wiring, PR template, general change-management checklist** → `lwd-change-control`.
- **The 3 error-handling buckets** (throw vs. log-and-continue vs. always-2xx) → CONTRIBUTING.md /
  non-negotiable #6 (webhooks are bucket 3 — this skill assumes you already know that rule and focuses
  on the signature-verification step that comes before it).
- **AI-eval gating for LLM features** → the AI-eval-owning skill.

## 1. Encryption at rest — the GATEWAY_ENCRYPTION_KEY(S) keyring

`src/server/services/encryption.ts` is AES-256-GCM (`createCipheriv`/`createDecipheriv`,
`ALGORITHM = "aes-256-gcm"`) with two supported envelope formats:

| Format | Shape | When produced |
|---|---|---|
| Legacy (3-part) | `iv:authTag:ciphertext` (all base64) | `GATEWAY_ENCRYPTION_KEY` only, no keyring configured |
| Keyring (4-part) | `keyId:iv:authTag:ciphertext` | `GATEWAY_ENCRYPTION_KEYS` configured — new writes always use this |

`GATEWAY_ENCRYPTION_KEYS` is `"<keyId>:<64-char-hex>[,<keyId>:<64-char-hex>...]"` (Zod-validated in
`src/lib/env.ts`, message: `'GATEWAY_ENCRYPTION_KEYS must be "<keyId>:<64-char hex>" entries,
comma-separated'`). The **first** entry is the active key used for all new `encryptJson`/`encryptString`
calls; **every** entry in the ring, plus the legacy `GATEWAY_ENCRYPTION_KEY` if still set, is tried on
decrypt (`decryptJson`/`decryptString`) — a 4-part ciphertext looks up its `keyId` directly, a 3-part
one tries the legacy key then falls back through the ring. GCM's auth tag makes a wrong-key decrypt
attempt fail loudly (never silently returns garbage), so trying multiple keys is safe.

**What's actually encrypted at rest today** (verified from real callers, not the docstring example —
grep for callers before adding a new claim here, comments drift):

| Data | Field / call site |
|---|---|
| Stripe/PayPal gateway credentials | `GatewaySetting.configJson` — written in `src/server/routers/gatewaySettings.ts`, read in `stripe-client.ts`, `stripe-webhook-validator.ts`, `portal.ts`, `recurring-autopay.ts`, `charge-saved/route.ts` |
| Contractor SSN/EIN | `Contractor.tinEncrypted` (`prisma/schema.prisma` line ~1308) via `encryptString`/`decryptString` in `src/server/routers/contractors.ts` |
| Signed e-signature image/path data | `src/server/services/signature.ts` (`encryptSignature`/`decryptSignature`, wraps `encryptJson`/`decryptJson`) |

### Rotation runbook (verified against `encryption.ts` + `encryption-keyring.test.ts`; no automated re-encrypt tool exists — see gap below)

1. Generate a new key: `openssl rand -hex 32`.
2. Prepend it to `GATEWAY_ENCRYPTION_KEYS` with a **new, never-reused key id**, keeping every old
   entry (and the legacy `GATEWAY_ENCRYPTION_KEY`, if any org still has 3-part ciphertext) in place:
   ```
   GATEWAY_ENCRYPTION_KEYS="k2:<new-64-hex>,k1:<old-64-hex>"
   ```
   (This is the exact form documented in `.env.example`.) Deploy this before doing anything else —
   until you do, nothing can decrypt with the new key, so there's no rush and no window where
   existing ciphertext breaks.
3. After deploy, confirm new writes use the new key: create/update one `GatewaySetting` and check
   `configJson` starts with `k2:` (4-part envelope, first segment is the key id).
4. **Re-encrypt existing rows.** There is no shipped script for this — `AUDIT-2026-05.md` (item S8)
   flags "no documented procedure" and proposes a `gateway:rotate-encryption-key` script as a roadmap
   item; it does not exist in `package.json` today. Until one is written, re-encryption means: for each
   row using an old `keyId` (or the legacy 3-part format), `decryptJson`/`decryptString` then
   `encryptJson`/`encryptString` and save — across `GatewaySetting.configJson`, `Contractor.tinEncrypted`,
   and any signature-storing table. Treat "write this script" as an open task, not a thing you can `npm run`.
5. Only remove an old key from `GATEWAY_ENCRYPTION_KEYS` (or drop the legacy `GATEWAY_ENCRYPTION_KEY`)
   after step 4 confirms zero rows still reference it — removing early makes those rows permanently
   undecryptable.

Tests: `src/test/encryption.test.ts` (legacy format), `src/test/encryption-keyring.test.ts` (rotation:
legacy-only, keyring-only, and mixed legacy+keyring decrypt paths).

## 2. Portal/pay session auth (`src/lib/portal-session.ts`)

Public `/portal/*`, `/pay/*` pages are token-gated (the invoice/client/estimate row carries a
`portalToken`). After a passphrase check, the server sets a **session cookie** that is an HMAC over
`token.expiry`, not the passphrase or a DB-backed session id:

```
signPortalSession(token, secret, maxAgeSeconds) → "<exp>.<hmac-sha256-hex>"
verifyPortalSession(cookieVal, token, secret)   → timing-safe compare, rejects if exp has passed
```

The HMAC secret is resolved by `getPortalSessionSecret()`: prefer the dedicated `PORTAL_SESSION_SECRET`
(Zod: `.string().min(32).optional()`), fall back to `SUPABASE_SERVICE_ROLE_KEY` for deployments that
haven't set the new var. **Always set `PORTAL_SESSION_SECRET` in production** — leaving it unset means
the service-role key (which also grants full DB access) doubles as the cookie-forgery key, so a leak of
one compromises the other.

Portal tokens themselves are minted by `generatePortalToken()` → `generateSecureToken()`
(`crypto.randomBytes(32).toString("hex")`, 64 hex chars) for new rows — not Prisma's `@default(cuid())`,
which is timestamp-based and guessable within a narrow time window. Existing rows seeded before this
change keep their CUID; rotate any suspected-leaked token via the `invoices.rotatePortalToken` procedure
(name per `AUDIT-2026-05.md` — re-check the router if it's moved).

Brute-force protection (`src/lib/portal-auth.ts`, shared by `/api/portal/[token]/auth` and
`/api/portal/dashboard/[clientToken]/auth`):
- Rate limit: 10 attempts / key / 15 min (`createRateLimiter`).
- Lockout: full lockout for 15 min after 5 failed passphrase attempts (`createLockoutTracker`).
- Passphrases are bcryptjs-hashed at cost **12** (`src/server/routers/clients.ts`,
  `bcrypt.hash(input.portalPassphrase, 12)`). `AUDIT-2026-05.md` (S9, low severity) suggests bumping to
  13; **not yet done** — don't claim it's 13.
- Timing/enumeration: `burnBcryptCompare()` runs a dummy `bcrypt.compare` against a fixed hash when the
  token/record isn't found, so "no such token" and "wrong passphrase" take the same time and return the
  identical body `GENERIC_PORTAL_AUTH_ERROR = { error: "Invalid token or passphrase" }` — don't split
  this into distinct 404 vs 401 responses, that reopens token enumeration.

**Open gap** (candidate, from `AUDIT-2026-05.md` S6, unverified-fixed as of 2026-07-05): the portal
*dashboard* session (`src/server/services/portal-dashboard.ts`, 30-day `SESSION_DURATION_MS`) records
`ipAddress`/`userAgent` at creation but does not appear to validate them on subsequent requests. If you
touch this file, check whether that's changed before assuming it's still open.

## 3. Signed-URL storage — the file-serving IDOR pattern

Every bucket that can hold tenant data is created `public: false` and served only through short-lived
signed URLs minted server-side:

| Bucket | File | Contains |
|---|---|---|
| `attachments` | `src/server/services/storage.ts` | invoice/client attachments |
| `receipts` | `src/lib/supabase-storage.ts` | expense receipts (financial PII) |
| `contractor-w9` | `src/lib/supabase-storage.ts` | W-9 forms (SSN/EIN) |
| `proposals` | `src/lib/supabase/storage.ts` | proposal PDFs/DOCX |

The **only** bucket that is intentionally `public: true` is `logos` (org branding images — low
sensitivity, needs no auth to render). Don't treat "our buckets are private" as a blanket fact; check
the specific bucket's `createBucket`/`updateBucket` call.

A signed URL alone isn't the security boundary — anyone who guesses/leaks a live signed URL can hit it
until it expires (60s–3600s depending on the route). The real boundary is the **check the app does
before minting one**. Two verified, correct patterns, both worth copying:

```ts
// Pattern A — DB ownership check (src/app/api/attachments/[id]/download/route.ts)
const attachment = await db.attachment.findFirst({
  where: { id, organizationId: orgId },   // <- the org filter IS the access check
  select: { storageUrl: true },
});
if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
const signedUrl = await createAttachmentSignedUrl(attachment.storageUrl);
```

```ts
// Pattern B — path-prefix check, no DB round trip needed
// (src/app/api/receipts/view/route.ts) — receipt paths are "${orgId}/${uuid}.${ext}"
if (!path.startsWith(`${orgId}/`)) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
const signedUrl = await createReceiptSignedUrl(path);
```

If you add a new signed-URL-serving route: pick whichever pattern fits (DB row exists → Pattern A; bare
storage path with a caller-supplied `path` param → Pattern B), but **never** call
`createXSignedUrl`/`createSignedUrl` directly from a caller-supplied id/path without one of these checks
first — that's an IDOR that lets any authenticated user in *any* org read any other org's files.

## 4. Webhook signature verification + idempotency

All three inbound webhooks verify a provider signature **before** touching the DB, and follow
non-negotiable #6 bucket 3 (always ack 2xx unless payload/signature is bad):

| Route | Signature check | Library |
|---|---|---|
| `src/app/api/webhooks/stripe/route.ts` | `validateStripeWebhook()` → `constructStripeEvent()` (`src/server/services/stripe.ts`, wraps `Stripe.webhooks.constructEvent`) | `stripe` SDK |
| `src/app/api/webhooks/resend/route.ts` | `new Webhook(secret).verify(rawBody, svixHeaders)` | `svix` |
| `src/app/api/webhooks/inbound-email/route.ts` | same `svix` `Webhook.verify` pattern | `svix` |

Stripe verification is more involved than "check the header": `validateStripeWebhook()`
(`src/server/services/stripe-webhook-validator.ts`) reads the **raw body** (needed for byte-exact
signature verification — never `req.json()` first), resolves which org's webhook secret to try (from
event metadata, falling back to a `Payment.transactionId` lookup for dispute/refund events that carry
no metadata), decrypts that org's `GatewaySetting.configJson` to get `webhookSecret`, verifies the
signature against it, and cross-checks any `metadata.orgId` on the verified event against the org
whose secret verified it. A forged event can't pass because it would need to be signed with a real
org's actual webhook secret.

**Idempotency / dedup** is layered:
1. Per-instance in-memory `Map` (`processedEvents` in `stripe/route.ts`) — fast path, doesn't survive
   restarts or help across replicas.
2. Cross-instance `WebhookDelivery` table (`prisma/schema.prisma`, `@@unique([provider, externalId])`),
   via `wasProcessed`/`markProcessed` in `src/server/services/webhook-dedup.ts`. `markProcessed` writes
   *after* successful processing (so a handler that throws mid-way gets legitimately retried), and
   swallows the Prisma P2002 unique-violation race (another replica already recorded it) rather than
   throwing. Self-prunes at ~1% write probability, deleting rows older than 3 days — no cron needed.
   Resend dedups on the **svix delivery id** (`svix-id` header), not `email_id` — one email emits
   multiple events (delivered/opened/clicked) sharing the same `email_id`, so keying on that would
   silently drop legitimate distinct events.
3. DB-transaction-level idempotency in the handler itself (e.g. checking `invoice.status === PAID`
   before recording a duplicate payment) as the last line of defense.

If you add a new webhook provider: verify its signature on the raw body before parsing JSON, use
`webhookJson()` (`src/lib/webhook-response.ts` — sets `X-Content-Type-Options: nosniff` and
`Cache-Control: no-store` explicitly, since webhook handlers echo attacker-influenced strings back into
error bodies) for every response, and add a `wasProcessed`/`markProcessed` pair keyed on that provider's
own stable delivery id (not a payload field that can repeat across distinct events).

## 5. Rate limiting as a security control

Two separate limiters exist, for different failure domains — using the wrong one for the wrong job is
the mistake to avoid:

| Limiter | File | Scope | Backing |
|---|---|---|---|
| In-process | `src/lib/rate-limit.ts` (`createRateLimiter`, `createLockoutTracker`) | Per serverless instance only — limit effectively multiplies by replica count | In-memory `Map`, bounded to 10k keys with LRU-ish eviction |
| Edge / cross-replica | `src/lib/rate-limiter.ts` (`getRateLimiters()`), invoked from `src/proxy.ts` | Global across replicas, buckets: `portal`, `pay`, `webhook`, `apiV1`, `ai` | Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) |

The edge limiter is a security backstop specifically because several in-process limiters are known to
be per-instance-only by design (`src/app/api/v1/auth.ts`'s comment says as much for its own 60 req/min
map) — the Upstash `apiV1` bucket in `getBucketForPath()` is what actually bounds a multi-replica
deploy. **If `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are unset, `getRateLimiters()` returns
`null` and `proxy.ts` silently skips the edge check entirely** — no error, no log. These two vars are
undocumented Tier-3 config (not in `.env.example`, not validated by `src/lib/env.ts`); see
`lwd-config-and-flags` for the tiering rule. From a security standpoint: confirm they're set in every
production environment, because their absence degrades every public endpoint's rate limiting down to
the weaker per-instance fallback with zero visible signal.

## 6. Secret scanning

- CI: `.github/workflows/gitleaks.yml` runs `gitleaks/gitleaks-action@v3` with `fetch-depth: 0` on
  push to `main` and on every PR.
- CI: `.github/workflows/codeql.yml` runs CodeQL static analysis (`javascript-typescript`) on push/PR
  to `main` plus a Monday 06:00 UTC schedule.
- Local: `githooks/pre-commit` runs `gitleaks git --pre-commit --staged`. This is **not** auto-wired by
  `postinstall` — `git config core.hooksPath githooks` (or equivalent) has to be set for it to fire on
  a given clone. See `lwd-change-control` for the wiring/mechanics; this skill only flags it as a
  security control that can silently be inactive on a machine that never ran that config command.

## Common mistakes

- Minting a signed URL from a caller-supplied id/path with no ownership check first (see §3) — the
  bucket being private does not protect you if the check in front of it is missing.
- Assuming all storage buckets are private — `logos` is deliberately public; check before generalizing.
- Removing an old key from `GATEWAY_ENCRYPTION_KEYS`/`GATEWAY_ENCRYPTION_KEY` before every row using it
  has been re-encrypted — there is no re-encrypt tooling yet, so "rotate" without a manual re-encrypt
  pass just narrows, it doesn't complete, the rotation.
- Parsing a webhook body as JSON before verifying its signature — signature verification needs the
  exact raw bytes; `req.json()` first can desync from what the provider actually signed.
- Keying webhook dedup on a payload field that can repeat across distinct events (e.g. Resend's
  `email_id`) instead of the provider's own per-delivery id (`svix-id`).
- Treating `AUDIT-2026-05.md`'s roadmap table as current state without checking — several items in it
  (S3, S4, S7, and the edge backstop for S1) are already fixed; others (S6, S9) are still open. Don't
  cite it as "the current security posture," cite it as a dated snapshot plus a diff you re-check.
- Assuming the local gitleaks pre-commit hook fires by default — it requires `core.hooksPath` to be
  pointed at `githooks/` on that clone.

## Provenance and maintenance

Date-stamped: **2026-07-05**. Verified by opening (not recalling) each file below on that date.

Files verified: `src/server/services/encryption.ts`, `src/test/encryption.test.ts`,
`src/test/encryption-keyring.test.ts`, `src/lib/env.ts` (`GATEWAY_ENCRYPTION_KEY(S)`,
`PORTAL_SESSION_SECRET`, `INNGEST_SIGNING_KEY`, absence of `UPSTASH_*`), `.env.example` (keyring
example format), `src/lib/portal-session.ts`, `src/lib/portal-auth.ts`, `src/server/routers/clients.ts`
(bcrypt cost factor), `src/server/services/portal-dashboard.ts`, `src/lib/rate-limit.ts`,
`src/lib/rate-limiter.ts`, `src/proxy.ts`, `src/app/api/v1/auth.ts`, `netlify.toml` (cache headers),
`.github/workflows/gitleaks.yml`, `.github/workflows/codeql.yml`, `githooks/pre-commit`, `package.json`
(confirmed no `postinstall` hook wiring, no `gateway:rotate-encryption-key` script),
`prisma/schema.prisma` (`WebhookDelivery`, `GatewaySetting`, `Contractor.tinEncrypted`),
`src/app/api/webhooks/stripe/route.ts`, `src/app/api/webhooks/resend/route.ts`,
`src/app/api/webhooks/inbound-email/route.ts`, `src/server/services/stripe-webhook-validator.ts`,
`src/server/services/stripe.ts`, `src/server/services/webhook-dedup.ts`, `src/lib/webhook-response.ts`,
`src/lib/supabase-storage.ts`, `src/server/services/storage.ts`, `src/lib/supabase/storage.ts`,
`src/app/api/attachments/[id]/download/route.ts`, `src/app/api/receipts/view/route.ts`,
`src/server/services/signature.ts`, `src/server/routers/contractors.ts`,
`docs/reviews/AUDIT-2026-05.md`, `docs/reviews/2026-04-06-profitability-milestones-forecasting-review.md`.

Re-verification: run `bash .claude/skills/lwd-security-and-secrets/scripts/security-census.sh` from the
repo root (a real subprocess, so it bypasses this shell's `rtk` grep/find hook, which truncates piped
output interactively and can undercount — verified during authoring, see
`lwd-architecture-contract`'s "Measurement gotcha" note for the mechanism). It re-checks: encryption
callers, keyring env validation, `WebhookDelivery` presence, webhook signature-check presence, bucket
public/private flags, portal/pay cache headers, `INNGEST_SIGNING_KEY` prod-required, bcrypt cost
factor, gitleaks CI + hook file presence, and the Upstash Tier-3 gap.

Known-stale-by-design: `AUDIT-2026-05.md`'s severity table is a May-2026 snapshot; treat every item in
it as "true then, re-check now" — this skill's §1–§6 already fold in which of its security items are
fixed (S3, S4, S7, S1-edge-backstop) vs. still open (S6, S8 no rotation tool, S9 bcrypt cost) as of this
date, but the audit itself will keep drifting further from current state.
