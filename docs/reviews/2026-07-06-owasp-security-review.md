# OWASP Security Review — 2026-07-06

**Scope:** Full-tree OWASP-oriented review of `src/` (tRPC routers, API route
handlers, auth/session/crypto, storage, webhooks, email/PDF rendering, config).
Organized against the OWASP Top 10. Builds on `AUDIT-2026-05.md` — that doc's
roadmap items are re-checked here (several are now fixed; the rest are folded in
below with current status).

**Method:** Four parallel auditors swept A01 (access control/IDOR), A03
(injection/XSS), A02/A07 (crypto/auth), and A05/A10 (misconfig/SSRF/DoS). Every
finding acted on below was confirmed by reading the code and tracing the data
flow to a user-controlled input, not from a grep hit alone.

**Verification ceiling:** Changes are **type-checked (`tsc --noEmit` clean) and
unit-tested** — full suite **2158 tests pass** (2153 baseline + 5 new). No live
database, no deployed environment, and no browser session were exercised. The
2FA-enforcement change (middleware) and the SSRF host-pin are verified by tests
and by reading Supabase's `getUser()` contract, not by an end-to-end auth run —
validate the 2FA step-up against a real Supabase session before treating it as
closed. `npm audit` (prod + dev): **0 vulnerabilities**.

---

## Fixed in this pass

### A07 — Self-enrolled 2FA was not enforced server-side (**High**)
`src/proxy.ts` gated the aal1→aal2 step-up on
`user.app_metadata?.require2FA || user.app_metadata?.mfaEnrolled`, but
`mfaEnrolled` **was never written anywhere in the codebase** (grep-confirmed:
read at `proxy.ts:101/103`, never set by the enrollment flow, migrate route, or
org sync). So a user who self-enrolled TOTP in an org that does not org-wide
require 2FA had both flags undefined, and the middleware skipped MFA entirely —
an attacker with only the password could ride an aal1 session straight to
`/dashboard`, the enrolled second factor providing no protection (the client-side
redirect in `sign-in/page.tsx` is trivially bypassed).

**Fix:** the middleware now derives enrollment from the user's *actual* factors —
`(user.factors ?? []).some(f => f.status === "verified")` — which `getUser()`
already returns, so there is **no extra round-trip**, no dependency on a
client-written flag, and no backfill gap for users who enrolled before this
change. The `app_metadata.mfaEnrolled` read is removed.

### A03 — Email HTML injection via unescaped client/expense names (**Medium**)
Two email paths interpolated user-controlled fields into an HTML body without
escaping, while the rest of the app uses the escaping helper `renderTemplateHtml`
(`automation-template.ts`):
- `src/server/services/automation-runner.ts:163` — `SEND_EMAIL` action built
  `html` with the non-escaping `interpolateTemplate`. A client named
  `<img src=x onerror=...>` had that markup delivered to the client's inbox on
  every rule-triggered email. **Fixed** — now uses `renderTemplateHtml` (escapes
  then linkifies). Subject stays plain (it's a structured Resend header field,
  not HTML). Regression test added.
- `src/server/services/report-pdf-generator.ts` — all five report generators
  interpolated org/client/expense/supplier/tax names and invoice numbers into
  HTML that is both rendered to PDF and **embedded verbatim into scheduled-report
  emails** (`scheduled-reports.ts`). **Fixed** — added an `esc()` helper and
  wrapped every user-controlled field.

### A03 — CSV formula injection in the bulk-export router (**Medium**)
`src/server/routers/exports.ts` `csvCell` did RFC-4180 quoting but **not** the
`^[=+\-@\t\r]` formula-prefix guard that every other CSV path in the app
(`year-end-csv.ts`, `contractor-1099-csv.ts`, the three report-export routes)
already has. A client named `=HYPERLINK(...)` or a DDE payload would execute when
an accountant opened `invoicesCSV`/`clientsCSV`/`expensesCSV` in Excel/Sheets.
**Fixed** — cells matching the formula prefix are now prefixed with `'`.

### A01 — Weekly-briefing read used stale `app_metadata` org (**Medium**)
`src/app/api/dashboard/weekly-briefing/route.ts` resolved the org from
`user.app_metadata?.organizationId` instead of a live `UserOrganization`
membership. A user removed from an org (membership row deleted) kept that id in
Supabase metadata and could still `GET` the org's financial briefing — projected
cash position, overdue totals, at-risk clients. **Fixed** — routed through
`getAuthenticatedOrg()` like every sibling route (the helper explicitly documents
that the `app_metadata` fallback was removed for exactly this reason).

### A10/DoS — `assistant.ask` tRPC path had no rate limit (**Medium**)
The SSE twin (`api/assistant/stream`) caps LLM usage at 20/min/org, but the
`assistant.ask` tRPC mutation (`src/server/routers/assistant.ts`) ran the full
Anthropic tool-use loop with no limiter — a client could hammer it to run up
unbounded API cost. **Fixed** — added a matching 20/min/org in-process limiter.

### A07 — Admin passphrase change didn't revoke portal sessions (**Low/Med**)
The self-service reset route revokes sessions, but the admin `clients.update`
mutation (`src/server/routers/clients.ts`) wrote a new/removed passphrase hash
without clearing live sessions — a stolen 30-day dashboard session survived a
passphrase rotation done to contain a compromise. **Fixed** — `update` now
`deleteMany`s the client's portal sessions whenever the passphrase changes or is
removed. Three regression tests added (change / remove / unrelated-update).

### A10 — SSRF via org logo URL rendered server-side in PDFs (**Low/Med**)
`organization.update` accepted `logoUrl: z.string().url()` with no host
constraint; react-pdf fetches that URL **server-side** when generating invoice/
proposal PDFs. An authenticated admin could set it to
`http://169.254.169.254/...` or an internal host and trigger a blind SSRF.
**Fixed** — `logoUrl` is now pinned to `https` on the app's own Supabase storage
origin (the only host the supported `/api/logo` upload path ever writes). Test
added asserting off-host and metadata-IP URLs are rejected.

### A09 — Raw `error.message` leaked to clients (**Low**, Med for portal)
Several handlers returned raw `err.message` — which `safeErrorResponse`'s own
docstring warns can carry encryption/gateway keys, file paths, and library
internals. **Fixed** the highest-value ones:
- `contractor-portal/[token]/1099` and `.../w9` — token-accessible (effectively
  unauthenticated) endpoints; now use `safeErrorResponse`.
- `invoices/[id]/pdf`, `invoices/preview-pdf`, `invoices/[id]/proposal-pdf` — the
  exact PDF-render case the helper exists for; now use `safeErrorResponse`.

### A02 — MFA recovery codes generated with `Math.random()` (**Low**)
`MfaEnrollment.tsx` generated recovery codes with `Math.random()`. They are
currently non-functional (not stored server-side, per the code's own comment),
but a predictable generator would be a bypass if ever wired to real auth.
**Fixed** — now uses `crypto.getRandomValues`. (The larger issue — these codes
are security theater until stored server-side — is noted under Roadmap.)

### A07 — bcrypt cost bumped 12 → 13 (**Low**, AUDIT-2026-05 S9)
`clients.ts` portal-passphrase hashing moved to cost 13. Existing cost-12 hashes
still verify (bcrypt stores the cost in the hash), so this is forward-only with
no migration.

---

## Confirmed still-open — needs a decision, migration, or ops change (not fixed here)

### A01 — `VIEWER` role can perform mutations on several routers (**Medium**, intra-tenant)
`milestones`, `tasks`, `timeEntries`, `proposals`, `projectTemplates`,
`proposal-templates`, `taskStatuses` gate their update/delete (and create) on
bare `protectedProcedure`, so a `VIEWER` can create/edit/delete and bill
tasks/time to invoices in their own org. Blast radius is **intra-tenant only**
(all queries are correctly org-scoped) — this is not a cross-tenant leak. It is
**not auto-fixed** because the *whole* router (including `create`) is un-gated,
so whether `VIEWER` is a strict read-only role or the default collaborator role
is a **product-policy decision**: adding `requireRole` could lock out legitimate
users. **Recommendation:** decide `VIEWER`'s contract, then gate these mutations
with `requireRole("OWNER","ADMIN","ACCOUNTANT")` to match the financial routers.

### A02 — Organization `payerTin` (EIN/SSN) stored in plaintext (**Medium**)
`prisma/schema.prisma` `Organization.payerTin` holds the org's federal Tax ID
(the schema comment notes it can be a sole-proprietor SSN) unencrypted, while the
analogous `Contractor.tinEncrypted` is AES-GCM-encrypted with a `tinLast4`
display value. **Not fixed here** — it needs a schema migration + encrypt-on-read/
write path + backfill of existing rows, which is out of scope for a no-DB review
pass. **Recommendation:** mirror the `Contractor.tinEncrypted`/`tinLast4` pattern
(`encryptString`/`decryptString` from `encryption.ts`) in a dedicated migration PR.

### A02 — No key-rotation re-encrypt tooling (**Medium**, AUDIT-2026-05 S8)
Still no `gateway:rotate-encryption-key` script; the keyring supports rotation but
re-encrypting existing rows is a manual decrypt-then-encrypt loop. Documented in
`lwd-security-and-secrets`. **Recommendation:** ship the script before the next
key rotation.

### A07 — Portal dashboard 30-day session doesn't pin IP/UA (**Medium**, AUDIT-2026-05 S6)
`portal-dashboard.ts` records `ipAddress`/`userAgent` at session creation but
never validates them on later requests; `SESSION_DURATION_MS` is 30 days. A
stolen session cookie is usable for the full window from anywhere.
**Recommendation:** shorten to ~24h or soft-pin UA/IP for sessions older than a
day (behavior tradeoff — flagged for a product call).

### A05 — Upstash edge rate limiter silently disables if env unset (**Medium**, ops)
`getRateLimiters()` returns `null` and `proxy.ts` skips the edge check with no
error/log when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are unset (undocumented Tier-3
config). Every public endpoint then degrades to the weaker per-instance limiter
with zero signal. **Recommendation:** confirm both are set in every production
env; consider a boot-time warning when they're absent in production.

### A05 — CSP allows `'unsafe-inline'` scripts (**Low / informational**)
`next.config.ts` ships a strong header set (CSP with `frame-ancestors 'none'`,
HSTS+preload, `X-Content-Type-Options`, COOP/CORP, `X-Frame-Options: DENY`), but
`script-src` includes `'unsafe-inline'` with no nonce, weakening XSS
defense-in-depth for a financial app. Next.js's inline bootstrap makes this
non-trivial; **recommendation:** move to a nonce/`strict-dynamic` CSP when
feasible.

### A09 — Remaining authenticated `error.message` leaks (**Low**)
`clients/[id]/statement`, `logo`, `expenses/receipt(+/ocr)`, `attachments`,
`contractors/w9`, and `v1/reports/weekly-briefing` still return raw `err.message`
(authenticated callers, own-org errors — low severity). **Recommendation:** route
them through `safeErrorResponse` for consistency in a follow-up cleanup.

---

## Verified clean (no finding)

- **Cross-tenant IDOR:** no bare-`id` mutation/read was found in any tRPC router
  or non-webhook API route — every one filters by `organizationId`/`ctx.orgId`,
  checks a parent relation, or does a preceding org-scoped ownership check. The
  historical `reopen` bare-id pattern is not present anywhere inspected.
- **Raw SQL:** all `$queryRaw`/`$executeRaw` are tagged-template parameterized;
  no `*Unsafe` variants, no `Prisma.raw` with user data.
- **DOM XSS:** the single `dangerouslySetInnerHTML` (`markdown-preview`) escapes
  input first and emits only fixed tags; AI/chat/inbound-email content renders as
  React text nodes.
- **Path traversal / upload content-type:** storage libs sanitize filenames, use
  UUID names under an `${orgId}/` prefix, and `file-validation.ts` enforces a MIME
  allowlist + magic-byte match (SVG/HTML rejected). Download routes use DB
  ownership or an `${orgId}/` path-prefix check before minting signed URLs.
- **Open redirect / email headers:** `safe-redirect.ts` rejects `//`, `/\`, and
  off-site targets and gates all auth redirects; email fields go to the Resend SDK
  structurally.
- **Webhooks:** Stripe/Resend/inbound-email all verify provider signatures on the
  raw body before parsing, with cross-instance `WebhookDelivery` dedup.
- **CORS / CSRF:** no wildcard/reflected CORS anywhere; state-changing routes are
  POST-only with `sameSite: lax` cookies; the v1 API is Bearer-token (not
  cookie/CORS exposed).
- **Pagination:** shared input clamps `pageSize` to ≤100/200; no unbounded
  caller-controlled `take`.
- **Secrets hygiene:** no hardcoded secrets outside tests; `SUPABASE_SERVICE_ROLE_KEY`
  is server-only, never `NEXT_PUBLIC_`, never logged. Inngest signing enforced in
  prod. `npm audit` clean.

---

## OWASP Top-10 coverage summary

| Category | Status |
|---|---|
| A01 Broken Access Control | 1 fixed (weekly-briefing); 1 open policy decision (`VIEWER` mutations); no cross-tenant IDOR found |
| A02 Cryptographic Failures | recovery-code RNG + bcrypt fixed; `payerTin` plaintext + rotation tooling open |
| A03 Injection | email HTML ×2 + CSV formula injection fixed; SQL/DOM-XSS clean |
| A04 Insecure Design | anti-enumeration, dedup, lockout, keyring all present |
| A05 Security Misconfiguration | strong headers; CSP `unsafe-inline` + Upstash-unset gap open (ops) |
| A06 Vulnerable Components | `npm audit` 0 vulnerabilities |
| A07 Auth Failures | **2FA enforcement (High) fixed**; session-revocation fixed; portal-session IP/UA pinning open |
| A08 Integrity Failures | webhook signatures + idempotency verified |
| A09 Logging/Monitoring | high-value error-leaks fixed; low-severity remainder open |
| A10 SSRF | logo-URL SSRF fixed; no other user-controlled server-side fetch found |
