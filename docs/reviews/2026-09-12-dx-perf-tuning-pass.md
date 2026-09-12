# DX + performance tuning pass — 2026-09-12

Follow-up to the 2026-09-05 audits (`2026-09-05-dx-audit.md`, `2026-09-05-performance-audit.md`).
Everything below was verified against a fresh `npm ci` at HEAD `bc32652f` before changing it.

## Baseline (local, Apple Silicon, warm npm cache)

| Step | Before | After |
|---|---|---|
| `tsc --noEmit` | 14s, **2 errors** (CI `check` job red) | 14s cold / 2s incremental, 0 errors |
| `eslint` | 11s, 0 errors / 68 warnings, unenforced | 10s, gated by `lint:ci` (`--max-warnings 68`) |
| `vitest run` | 9s, 209 files / 2304 tests | 8s, 208 files / 2300 tests (dead helper + its test removed) |
| `next build` cold / warm | 17s / 4s | 14s / 5s (unchanged within noise) |
| Netlify `deploy_time`, last 15 deploys | 77–125s | — (no cache/plugin change; expected unchanged) |

The Next compile itself is already fast (11s cold, <1s warm with the persisted Turbopack cache), so
build-time work went into removing redundant steps rather than the compiler.

## Bugs found while fixing the type errors

- **Resend + inbound-email webhooks returned 500 on every delivery.** svix 2.x `Webhook.verify()` only
  checks the signature and returns `undefined` (`node_modules/svix/dist/index.mjs`: `this.inner.verify(payload,
  headers, { jsonParse: false })` with no return). Both routes assigned that result to `payload`, so the
  first property read threw. `next.config.ts` has `typescript.ignoreBuildErrors: true`, so the `TS2352`
  that flagged it never blocked a deploy. Both routes now verify, then `JSON.parse(rawBody)`.
- **Stripe `apiVersion` literal drifted on every SDK bump** (`"2026-07-29.dahlia"` vs the installed
  `"2026-08-26.dahlia"`). stripe-node defaults to `DEFAULT_API_VERSION`, the same value the literal must
  equal to type-check, so the literal was removed.

## Performance

- `src/sentry.server.config.ts` loads `@sentry/profiling-node` (native addon) only when `SENTRY_DSN`
  is set. Production behaviour is unchanged; dev, CI builds and DSN-less previews skip the addon load.
  Verified with `next start` + requests against the DSN-enabled branch.
- `public/logo.png` and `public/logo-horizontal.png` (1408×768 PNG, ~1.1 MB each, zero references)
  and the five create-next-app SVGs were deleted; `sw.js` no longer lists `logo*.png` as cacheable and
  bumped `CACHE_VERSION` to `v2`.
- `InvoiceCanvas` org logo moved from a raw `<img>` to `next/image` with explicit dimensions and the
  same `isOptimizableLogoUrl` gate the portal uses, so it reserves layout and gets AVIF/WebP when the
  host is allow-listed.

## Developer experience

- `npm run typecheck`, `npm run lint:ci` (warning ratchet), `.nvmrc` = 22, `engines.node >= 22`.
- `prepare` lifecycle runs `scripts/setup-git-hooks.mjs`, which sets `core.hooksPath githooks`
  idempotently and never fails an install. `githooks/pre-commit` now skips with a notice when gitleaks
  isn't on PATH instead of hard-failing on a hardcoded Homebrew path.
- CI: dropped the redundant `npx prisma generate` (postinstall already runs it) from both jobs; lint is
  now a merge gate via `lint:ci`.
- `.env.example` documents `DIRECT_DATABASE_URL` and the Upstash pair, and drops the five Stripe/PayPal
  variables nothing reads (gateway credentials are per-org in Settings → Connections). README's
  gateway setup, env table, scripts list and `db:seed` comment were corrected to match.
- Dead code removed: `CashFlowWidget.tsx` (no importers since the #114 redesign) and
  `proposal-pdf-helpers.ts` (used only by its own test).
- `vitest.config.mts` uses `import.meta.dirname`; `withSentryConfig` imported from
  `@sentry/nextjs/config` (the bare import logs a v11 deprecation on every build).
- Stale claims fixed in `.claude/skills/lwd-{validation-and-qa,change-control,build-and-env,
  security-and-secrets,run-and-operate}` (lint "disabled", Node "not enforced", hook "not auto-wired").

## Still open (deliberately not changed)

- Production Prisma pool `max: 1` — blocked on confirming whether `DATABASE_URL` is the transaction
  pooler (2026-08-13 audit, finding 2). Needs `netlify env:list`, not a code change.
- 68 `react-hooks/*` ESLint warnings — now ratcheted, not burned down.
- `package.json` `allowScripts` pins exact versions (`@sentry/node-cpu-profiler@2.4.2`) that drift on
  bumps; npm 12 (Node 26) warns but still runs the scripts, so this is cosmetic for now.
- Client shared chunk is ~150 kB gzip (Sentry browser SDK + Supabase + react-dom). Sentry's
  `bundleSizeOptimizations` are applied through the webpack plugin path only; no Turbopack equivalent
  was found in `@sentry/nextjs@10.73`.
