---
name: lwd-build-and-env
description: Use when setting up LWD Invoices on a fresh machine or sandbox, when `npm run build` or `npm ci` fails, when you see "Module not found: src/generated/prisma", "prisma migrate deploy" connection/DDL errors, "Environment variable not found" / t3-env validation crashes, a hung migration against a Supabase pooler host, or when deciding whether a no-database sandbox result ("tsc passes", "tests are green") counts as verification of a build/deploy/UI claim.
---

# LWD Invoices: Build & Environment Setup

## Overview

One core principle: **there are two different "it builds" claims in this repo, and
conflating them is the #1 way this skill gets misused.**

1. **Fresh laptop with a reachable Postgres** — `npm run build` (`prisma migrate
   deploy && next build`) actually runs end to end, because migrate deploy can reach
   a real database.
2. **No-DB sandbox** — `npm run build` **cannot run** in this repo, ever, because the
   `build` script itself invokes `prisma migrate deploy` first. There is no flag that
   makes `npm run build` work without a database. The only thing you *can* run is a
   bare `npx next build` with placeholder env — and that proves compilation +
   prerendering, nothing about the database or a real page load.

Confusing "the bare `next build` I got to pass" with "the app builds and works" is
exactly the verification-ceiling trap called out project-wide. See `## The
verification ceiling` below before you tell anyone a build/DB/UI claim is proven.

## When to use / when NOT to use

Use this skill when you are: setting up the project for the first time, restoring a
dev environment after a wipe, debugging why `npm ci`/`postinstall`/`next dev` fails
on a clean checkout, or deciding what a sandbox-without-a-database run does and does
not prove.

Do NOT use this skill for:
- Running/reading migrations against a **live/production** database, deploy
  mechanics, Netlify build behavior in production, or Inngest/webhook operation →
  **lwd-run-and-operate**.
- Env var *meaning* (what each `*_PROVIDER`, AI model, or feature flag does) →
  **lwd-config-and-flags**.
- Test suite structure, coverage gates, the AI eval harness, or what CI actually
  gates on → **lwd-validation-and-qa**.
- Secret scanning, credential handling, encryption key rotation → **lwd-security-and-secrets**.
- Debugging a specific runtime bug once the app is already running → **lwd-debugging-playbook**.

## Prerequisites

| Requirement | Verified where | Notes |
|---|---|---|
| Node.js 22 | `.github/workflows/ci.yml` (`node-version: 22`), `netlify.toml` (`NODE_VERSION = "22"`) | **Not enforced locally.** `package.json` has no `engines` field and there is no `.nvmrc`/`.node-version` file in the repo root. Nothing stops you running this on Node 20 or 24 and getting a subtly different failure. Pin your local Node yourself. |
| PostgreSQL (Supabase recommended) | `README.md` Prerequisites | Self-hosted Postgres 14+ also works per README's Self-Hosting Guide. |
| npm | `package-lock.json` present | Repo uses npm, not pnpm/yarn — `npm ci` is the reproducible-install command. |

## Setup: fresh laptop, real database reachable

```bash
git clone https://github.com/mlaplante/LWD-Invoices.git
cd LWD-Invoices

npm ci                        # installs deps; postinstall runs `prisma generate`
cp .env.example .env           # fill in real values, see table below
npx prisma migrate deploy      # apply all migrations (or `npx prisma migrate dev` for a local dev DB)
npm run db:seed                # optional — see "seed is a stub" below, currently a no-op
npm run dev                    # http://localhost:3000
```

Notes on each step, verified against the repo:

- **`postinstall` runs `prisma generate` automatically** (`package.json` →
  `"postinstall": "prisma generate"`). This writes the generated Prisma client to
  `src/generated/prisma` (per `output = "../src/generated/prisma"` in
  `prisma/schema.prisma`), which is gitignored (`.gitignore:47`). If you ever run
  `npm ci --ignore-scripts`, or postinstall is skipped/fails silently, you get
  `Module not found: Can't resolve '../generated/prisma'` (or similar) from `tsc`
  or any test that imports the Prisma client — the fix is just `npx prisma
  generate`, not a dependency problem.
- **`.env.example` → `.env`**: copy and fill in. The required block (per
  `.env.example` and `src/lib/env.ts`'s `createEnv` schema): `DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GATEWAY_ENCRYPTION_KEY` (in
  production only — optional in dev per the zod `.refine` in `env.ts`),
  `NEXT_PUBLIC_APP_URL`. Every other var in `.env.example` (AI provider keys/models,
  Stripe/PayPal, Inngest, webhook secrets, `PORTAL_SESSION_SECRET`) is optional for
  boot — see **lwd-config-and-flags** for what each one actually does.
- **`npx prisma migrate deploy` (or `db:migrate`, same command) needs a DDL-capable
  connection** — see the pooler trap below, this is the single most common fresh-setup
  failure against a Supabase project.
- **`npm run db:seed` currently seeds nothing.** `prisma/seed.ts` only prints
  `"Seeding complete (no global seed data — org-scoped records only)."` and exits —
  despite README's "Seed the database with sample data" line. Don't expect sample
  invoices/clients; you'll need to create an org through onboarding (sign up in the
  UI) to get any usable data.
- **`npm run dev`** is plain `next dev` (Turbopack default in Next 16) — no special
  flags needed once `.env` and the DB are in place.

### The DIRECT_DATABASE_URL trap (undocumented in .env.example)

`prisma.config.ts` resolves the migration datasource as:

```ts
url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
```

with the comment: *"For migrations, prefer DIRECT_DATABASE_URL (Supabase direct
connection or session pooler). Transaction-pooler URLs (port 6543) do NOT support
DDL — use direct/session pooler here."*

`DIRECT_DATABASE_URL` is **not listed in `.env.example`** — a fresh setup following
only `.env.example` will point `DATABASE_URL` at Supabase's connection-pooling URL
(often port 6543, `pgbouncer=true`), and `prisma migrate deploy` will fail or hang
because `CREATE TABLE`/`ALTER TABLE` (DDL) isn't supported through the transaction
pooler.

Fix: set `DIRECT_DATABASE_URL` in `.env` to the Supabase **session pooler** URL
(port 5432, no `pgbouncer` param) or the direct connection string, before running
any `prisma migrate *` command. `scripts/apply-perf-indexes.mjs` and
`scripts/check-perf-indexes.mjs` encode the same rewrite in code (rewriting a
`*.pooler.supabase.com` host to port 5432 and stripping `pgbouncer`/
`pool_timeout`/`connection_limit` params) if you want a reference implementation —
those scripts are for applying/checking performance indexes specifically; see
**lwd-run-and-operate** for running them. `scripts/baseline-existing-migrations.ts`
is a related one-shot recovery tool for when the migrations table is out of sync
with an already-built schema — also cross-ref **lwd-run-and-operate**.

Related, separately-documented trap: Supabase's **direct** URL can hang over IPv6 on
some networks — if `DIRECT_DATABASE_URL` pointed straight at the direct host hangs
instead of erroring, switch to the session-pooler form (port 5432) instead, same as
the scripts do.

## The verification ceiling (READ BEFORE claiming a build/DB/UI result)

This project's dev sandbox (the environment you may be running in right now) has
**no database**. That means:

- `npm run build` cannot run. Its script is literally `prisma migrate deploy &&
  next build` (`package.json`) — with no DB, `migrate deploy` fails immediately and
  `next build` never even starts.
- There is no environment variable that makes `prisma migrate deploy` skip needing
  a database. Don't invent one.

What you *can* run, and what it proves, is exactly what CI's `build` job does
(`.github/workflows/ci.yml`) — copy this recipe verbatim, don't improvise a
different placeholder set:

```bash
SKIP_ENV_VALIDATION=1 \
NEXT_TELEMETRY_DISABLED=1 \
DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
SUPABASE_URL=https://placeholder.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
npx next build
```

`SKIP_ENV_VALIDATION` is real and load-bearing: `src/lib/env.ts` passes
`skipValidation: !!process.env.SKIP_ENV_VALIDATION` into `createEnv`, which bypasses
the zod schema that would otherwise reject the placeholder values (e.g.
`DATABASE_URL` must be a URL, `SUPABASE_SERVICE_ROLE_KEY` must be non-empty). CI's
own comment on this step: *"static prerendering instantiates Supabase clients at
build time, but no real services are contacted. Migrations are NOT run here —
netlify.toml owns `prisma migrate deploy` on real deploys."*

**What a green run of that command proves:** TypeScript compiles under `next build`
(note: `next.config.ts` also sets `typescript: { ignoreBuildErrors: true }`, so run
`npx tsc --noEmit` separately if you need real type-checking — this is what CI's
`check` job does, not the `build` job), the app prerenders without throwing, bundles
resolve.

**What it does NOT prove:** that any page renders correct data, that any query is
correctly org-scoped, that migrations apply cleanly against a real schema, that any
button/form/webhook actually works. Passing `tsc --noEmit` and `npm run test:run`
(no DB needed — `src/test/setup.ts` seeds fake env vars before any module loads and
mocks `server-only` + `next/cache`) plus this placeholder `next build` is **not**
"verified" for anything DB- or UI-shaped — full stop. Cross-ref
**lwd-validation-and-qa** for what the test suite does and doesn't cover, and
**superpowers:verification-before-completion** / the project's own
"sandbox-green ≠ done" rule before writing up a result as proven.

## Available scripts (`package.json`, verified)

| Script | Command | Needs a DB? |
|---|---|---|
| `dev` | `next dev` | Yes, to use the app; no, to start the process |
| `build` | `prisma migrate deploy && next build` | **Yes** — this is the trap above |
| `analyze` | `ANALYZE=true next build --webpack` | No (placeholder env, same as CI build) |
| `start` | `next start` | Yes, at runtime |
| `lint` | `eslint` | No, but see note below |
| `postinstall` | `prisma generate` | No |
| `db:migrate` | `prisma migrate deploy` | Yes |
| `db:seed` | `tsx prisma/seed.ts` | Yes (currently a no-op — see above) |
| `db:push` | `prisma db push` | Yes |
| `db:studio` | `prisma studio` | Yes |
| `test` / `test:run` / `test:coverage` | `vitest` variants | No |
| `test:eval` | `vitest run src/test/ai-eval` | No, but needs AI provider keys for real (non-mocked) runs — see **lwd-validation-and-qa** |

Lint note: `.github/workflows/ci.yml` runs `npx tsc --noEmit` as its real type gate
and explicitly skips lint with the comment *"Lint is disabled until
eslint-config-next is compatible with ESLint 10 (eslint-plugin-react crashes:
contextOrFilename.getFilename is not a function)"*. `next.config.ts` sets
`typescript: { ignoreBuildErrors: true }` (verified) for the same reason it's
skipped in `next build` — the real type check is the separate `tsc --noEmit` step,
not the build. Don't rely on `npm run lint` or a green `next build` as a
type-safety signal.

## Common mistakes

- **Running `npm run build` in a no-DB sandbox and reporting the failure (or a
  workaround) as "the build is broken."** It's not broken — it needs a database by
  design (netlify.toml owns migrations on deploy; see non-negotiable about
  `prisma migrate deploy`). Use the CI placeholder recipe above instead, and label
  the result correctly.
- **Setting only the vars in `.env.example` and being surprised `prisma migrate
  deploy` hangs or errors against Supabase.** Add `DIRECT_DATABASE_URL` pointed at
  the session pooler (5432) or direct host — see the trap above.
- **Expecting `npm run db:seed` to populate sample invoices/clients.** It's
  currently a no-op stub; create data through the onboarding flow instead.
- **Treating `npm run lint` (or a green `next build`) as a type-safety check.**
  Lint is effectively disabled; `next build` also has `ignoreBuildErrors: true`.
  Run `npx tsc --noEmit` directly.
- **Skipping `postinstall` (e.g. `npm ci --ignore-scripts`) and then chasing a
  phantom "missing module" bug.** Re-run `npx prisma generate` — `src/generated/prisma`
  is gitignored and only exists after generate runs.
- **Assuming Node 22 is enforced.** It isn't, locally — no `engines` field, no
  `.nvmrc`. Only CI and Netlify pin it.

## Provenance and maintenance

Date-stamped: 2026-07-05. Verified by opening (not recalling) each file below in
the actual repo at `/Users/mlaplante/.supacode/repos/LWD-Invoices/skills`:

- `package.json` — scripts, no `engines` field, deps (Next 16, React 19, Prisma 7,
  vitest 4).
- `README.md` — Prerequisites, Setup, Environment Variables, Available Scripts,
  Self-Hosting Guide.
- `netlify.toml` — build command, `NODE_VERSION=22`, the "keep prisma migrate
  deploy" comment.
- `vitest.config.mts` — `environment: "node"`, setup file path, coverage reporters.
- `src/test/setup.ts` — fake env vars, `server-only`/`next/cache` mocks.
- `prisma.config.ts` — `DIRECT_DATABASE_URL ?? DATABASE_URL` datasource resolution
  for migrations, pooler-vs-DDL comment.
- `prisma/schema.prisma` (grep for `output`) — generated client path
  `../src/generated/prisma`.
- `prisma/seed.ts` — confirmed no-op stub.
- `.gitignore` — confirmed `/src/generated/prisma` is ignored.
- `.env.example` — full var list; confirmed `DIRECT_DATABASE_URL` is absent.
- `src/lib/env.ts` — `createEnv` schema, `skipValidation: !!process.env.SKIP_ENV_VALIDATION`.
- `next.config.ts` — confirmed `typescript: { ignoreBuildErrors: true }`; confirmed
  it does NOT set eslint `ignoreDuringBuilds` (that claim, if you see it elsewhere,
  is stale/imprecise — the actual lint-skip mechanism per `ci.yml`'s comment is
  that lint is simply not run as a CI step).
- `.github/workflows/ci.yml` — the `check` job (`tsc --noEmit`, test:coverage) and
  the `build` job (placeholder env + `npx next build`, with its own comment
  explaining why).
- `eslint.config.mjs` — confirms an eslint config exists and is otherwise normal;
  the disablement is at the CI-step level, not inside this file.
- `scripts/apply-perf-indexes.mjs`, `scripts/check-perf-indexes.mjs`,
  `scripts/baseline-existing-migrations.ts` — pooler-URL rewrite logic, referenced
  but not duplicated (ownership: **lwd-run-and-operate**).

Re-verify if things drift:

```bash
# scripts + engines still match this doc?
node -e "console.log(require('./package.json').scripts, require('./package.json').engines)"

# netlify still runs migrate deploy before build?
grep -n "command" netlify.toml

# CI build job still using placeholder env + bare next build?
grep -n -A12 "name: Build" .github/workflows/ci.yml

# seed still a no-op?
cat prisma/seed.ts

# DIRECT_DATABASE_URL still missing from .env.example?
grep -n "DIRECT_DATABASE_URL" .env.example || echo "still absent"

# generated Prisma client path unchanged?
grep -n "output" prisma/schema.prisma

# Node version pin unchanged?
grep -n "NODE_VERSION\|node-version" netlify.toml .github/workflows/ci.yml
```

Uncertainties/candidates (not fully provable from static reading, labeled
accordingly): whether `npx prisma migrate dev` (README's original suggestion) vs
`migrate deploy` (this doc's preferred command, matching `db:migrate` and
production behavior) matters for a first-time local setup — both were left as
options above since `migrate dev` also creates the dev database's migration
history interactively; either works for a from-scratch local DB, but `migrate
deploy` is the non-interactive/CI-safe one and is what actually runs in
`build`/`db:migrate`.
