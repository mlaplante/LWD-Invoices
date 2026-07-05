---
name: lwd-run-and-operate
description: Use when running LWD Invoices locally ('npm run dev'), creating or deploying a Prisma migration, editing netlify.toml or package.json build scripts, debugging a Netlify deploy, wiring or troubleshooting an Inngest background job (recurring invoices, payment reminders, dunning, late fees, weekly briefing, forecast snapshots, project budget alerts), investigating "column X does not exist" 500s, working with Supabase Storage buckets/signed URLs for invoice/proposal/1099 PDFs or file attachments, or asking where the DB-heartbeat / warmup functions live. Covers dev-vs-deploy anatomy and migration workflow, not initial environment/secrets setup (see lwd-build-and-env) and not the org-scoping or financial-math rules themselves (see lwd-architecture-contract).
---

# LWD Invoices: Run and Operate

## Overview

One command builds the app for production, and it is not `npm run build`. Netlify
**overrides** `package.json`'s build script with the `command` in `netlify.toml`. Both
happen to run `prisma migrate deploy && next build` today, but they are two independent
strings that can drift apart. If someone "simplifies" `netlify.toml` and drops the
migrate step, deploys keep succeeding — builds are green — while the live Postgres
schema silently falls behind `schema.prisma`. The first symptom is a 500 with
`column "X" does not exist`, usually on whatever page/router touches the newest
migration. This is the single costliest failure class in this project's history
(there is a literal git revert for it: `f4e70cb`). Guard that line before you touch
anything else in this file.

## When to use / when NOT to use

Use this skill for: local dev server, the migration create→generate→deploy pipeline,
`netlify.toml` build anatomy, Inngest background jobs, the DB-heartbeat/warmup
functions, and where PDFs/exports/attachments physically live (Supabase Storage
buckets, signed URLs).

Do NOT use this skill for:
- Provisioning a brand-new environment / secrets from zero → **lwd-build-and-env**.
- The org-scoping rule itself, or the architectural layering (app → routers →
  services → db) → **lwd-architecture-contract**.
- Why a past change was reverted / historical incident narratives → **lwd-failure-archaeology**.
- PR/change process, review discipline → **lwd-change-control**.
- Running perf-index scripts, diagnostics tooling → **lwd-diagnostics-and-tooling**
  (this skill only tells you those scripts exist and where).
- Test/eval suite mechanics → **lwd-validation-and-qa**.
- Invoice/tax/accounting domain semantics → **invoicing-domain-reference**.

## Dev vs. deploy: two different pipelines

| | Local dev | Deploy (Netlify) |
|---|---|---|
| Command | `npm run dev` (`next dev`, Turbopack) | Netlify runs `netlify.toml`'s `[build].command`, **not** `package.json`'s `build` script |
| Migrations | You author them: `npx prisma migrate dev --name <name>` | Applied automatically: `prisma migrate deploy` (no-op if none pending) |
| Client generation | `postinstall` runs `prisma generate` after `npm install`; re-run manually after schema edits if your editor's types look stale | `prisma generate` runs explicitly as the first step of the build command |
| DB required? | Yes — `next dev` doesn't touch migrations, but nearly every route hits Prisma | Yes — the build itself connects to run `migrate deploy` |

Verified in `package.json`:
```json
"dev": "next dev",
"build": "prisma migrate deploy && next build",
"postinstall": "prisma generate",
"db:migrate": "prisma migrate deploy",
"db:seed": "tsx prisma/seed.ts",
"db:push": "prisma db push",
"db:studio": "prisma studio"
```

`db:push` (`prisma db push`) skips the migrations table entirely — schema-sync only,
no SQL file, no history row. Fine for local scratch/prototyping; **never** use it
against an environment `migrate deploy` also targets, or the two mechanisms will
disagree about what's been applied.

## The migration workflow (do this, in this order)

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <short-imperative-name>` — this both writes the SQL
   under `prisma/migrations/<timestamp>_<name>/migration.sql` *and* applies it to your
   local dev DB in one step. If your local DB is unreachable, use
   `npx prisma migrate dev --create-only --name <name>` to generate the SQL without
   applying it, then apply/verify by hand later.
3. `npx prisma generate` — regenerates the Prisma client (types under
   `src/generated/prisma`). `migrate dev` already calls this for you at the end of
   step 2; run it standalone only if you skipped `migrate dev` (e.g. after
   `--create-only`, or after pulling someone else's migration).
4. Commit the new `prisma/migrations/<timestamp>_<name>/` directory. **Never hand-edit
   or delete an already-committed migration folder** — `migrate deploy` applies by
   filename/checksum in order; editing history after the fact desyncs whatever
   environment already applied the old version.
5. Deploy. `prisma migrate deploy` runs automatically as part of the Netlify build
   (see below) — you do not need to SSH in or run it by hand for a normal deploy.

Migration folder naming in this repo (verified via `ls prisma/migrations`): almost
all are `YYYYMMDDHHMMSS_snake_case_name` (Prisma's auto-generated timestamp prefix,
e.g. `20260626000000_add_dashboard_aggregate_indexes`). One legacy folder,
`20260225_add_receipt_url_to_expense`, uses a shorter date-only prefix — it still
sorts and applies correctly, but don't imitate it; let `migrate dev` generate the
prefix rather than hand-rolling one.

`prisma/migrations/migration_lock.toml` just pins `provider = "postgresql"` — do not
edit it.

## Deploy anatomy: netlify.toml

Verified contents of the `[build]` block (`netlify.toml`, repo root):

```toml
[build]
  # IMPORTANT: keep `prisma migrate deploy` in this command. netlify.toml
  # overrides package.json's build script entirely, so omitting it skips
  # migrations on deploy and the live DB drifts behind schema.prisma.
  # Symptom is "column X does not exist" 500s on any page that reads
  # the new column.
  command = "prisma generate && prisma migrate deploy && next build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
  NEXT_TELEMETRY_DISABLED = "1"
  NETLIFY_NEXT_CACHE_PERSIST = "true"   # persist .next/cache between builds

[functions]
  node_bundler = "esbuild"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

The comment above `command` is load-bearing documentation left by whoever fixed the
incident — treat it as the canonical warning, not decoration. If you're reviewing a
PR that touches `netlify.toml`, the one invariant to check is: does `command` still
contain `prisma migrate deploy` before `next build`? See **lwd-change-control** for
the review-process side of this rule.

`netlify.toml` also sets aggressive immutable caching for `/_next/static/*`, fonts,
and images, and explicitly forces `private, no-store` on `/portal/*` and `/pay/*`
(token-gated, per-recipient pages — must never be cached by a shared/CDN cache).

README.md's self-hosting guide (step 8) additionally tells a self-hoster to run
`npx prisma migrate deploy` "from your local machine before first deploy." Treat that
as belt-and-suspenders for the very first deploy against a brand-new database only —
every subsequent deploy already runs `migrate deploy` itself via the build command
above, so it is not something you need to do by hand on an ongoing basis. The
README also lists a Docker deployment option ("Build container with
`docker build -t lwd-invoices .`"); as of this writing **no `Dockerfile` exists in
the repo** — treat that README line as aspirational/unverified, not a working path.

## Background jobs: Inngest

Inngest functions are plain exported values from `src/inngest/functions/*.ts`,
registered in one place: `src/app/api/inngest/route.ts`, which calls Netlify/Next's
`serve({ client: inngest, functions: [...] })`. Verified count as of this writing:
**22 functions** registered in that array (more than one "job" concept is often
split into a scheduled cron function plus an event-triggered function, e.g.
`processAutomationRules` + `handleAutomationRuleEvent`). Conceptually they cover:
recurring invoices, overdue-invoice detection, payment reminders, recurring
expenses, email automations (rule-based + no-code builder), late fees, scheduled
reports, reminder sequences, invoice-total recalculation, client retention
check-ins, proposal-viewed nudges, the weekly business briefing, credit-hold
evaluation, scheduled invoice sends, dunning retries, project budget alerts,
cash-flow forecast snapshots, estimated-tax reminders, and the year-end export job.

Env vars required for Inngest to actually deliver (verified in `.env.example`):
`INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`. Inngest client id is fixed in
`src/inngest/client.ts`: `new Inngest({ id: "laplante-web-development-invoices" })`.

Example — cron-triggered function shape (`src/inngest/functions/recurring-invoices.ts`):
```ts
export const processRecurringInvoices = inngest.createFunction(
  { id: "process-recurring-invoices", name: "Process Recurring Invoices",
    triggers: [{ cron: "0 6 * * *" }] }, // daily at 6am UTC
  async () => { /* ... */ },
);
```
To add a new scheduled job: write the function in `src/inngest/functions/`, then you
**must** import and add it to the `functions: [...]` array in
`src/app/api/inngest/route.ts` — an unregistered function is dead code; Inngest never
sees it.

Locally: `npx inngest-cli@latest dev` runs the Inngest Dev Server against your
`/api/inngest` route (per README step 6). In production, point Inngest's dashboard
webhook at `https://<yourdomain>/api/inngest`.

## Keeping the DB warm

Two independent, non-overlapping mechanisms, verified by reading both files:

1. **`netlify/functions/db-heartbeat.mts`** — a Netlify scheduled function
   (config baked into the file itself: `export const config: Config = { schedule:
   "*/15 * * * *" }` — every 15 minutes, not set in `netlify.toml`). It first tries
   `GET /api/warmup` with header `x-warmup-secret: $WARMUP_SECRET` (env var, also
   verified in `.env.example`); if that fails or `URL`/`WARMUP_SECRET` aren't set,
   it falls back to a raw `pg` client `SELECT 1` against `DATABASE_URL`. Purpose:
   keep both the Next.js function and the Supabase connection-pooler path warm
   during idle gaps (cold-start avoidance), on a tight 15-minute cadence.
2. **`.github/workflows/supabase-heartbeat.yml`** — a GitHub Actions cron
   (`0 8 */4 * *`, every 4 days at 08:00 UTC) that does a bare `pg` `SELECT 1`
   against `DATABASE_URL` (from repo secrets). Purpose: Supabase auto-pauses free
   projects after 7 days of total inactivity — this exists purely to stay under
   that threshold, independent of the 15-minute warmup above.

The corresponding app route is `src/app/api/warmup/route.ts`: in `NODE_ENV=production`
it 404s unless the caller supplies the matching `x-warmup-secret` header, then runs
`db.$queryRaw\`SELECT 1\`` and returns latency. If you see 404s hitting `/api/warmup`
in prod logs, check that `WARMUP_SECRET` is set identically in both the Netlify site
env and wherever the heartbeat function reads it from (same Netlify site — it's one
env var, but it's easy to typo when rotating secrets).

## Where output/artifacts land

All PDF generation uses `@react-pdf/renderer`'s `renderToBuffer` — no headless
Chrome, no external rendering service. Verified files under `src/server/services/`:

| File | Produces |
|---|---|
| `invoice-pdf.tsx` | Invoice PDF (also exports `fullInvoiceInclude`, the Prisma `include` shape the PDF needs) |
| `invoice-pdf-cache.ts` | Caching wrapper around `invoice-pdf.tsx` — see below |
| `proposal-pdf.tsx` / `proposal-pdf-helpers.ts` | Proposal/estimate PDF |
| `client-statement-pdf.tsx` | Client statement PDF |
| `contractor-1099-pdf.tsx` | Per-contractor 1099-NEC + summary PDF |
| `year-end-pdf.tsx` | P&L / Expense Ledger / Payment Ledger / Tax Liability / AR Aging PDFs for the year-end export pack |
| `year-end-export-job.ts` | Orchestrates the year-end ZIP (CSV+PDF bundle), uploads to the `year-end-exports` bucket |
| `report-pdf-generator.ts` | HTML report generation (not react-pdf — produces `{ title, html, generatedAt }`) |

Invoice PDFs are cached, not just generated on demand
(`src/server/services/invoice-pdf-cache.ts`): the cache key is
`${invoice.id}/${invoice.updatedAt.getTime()}.pdf`, so any mutation that bumps
`updatedAt` produces a new cache key automatically — invalidation is implicit, there
is no explicit "bust the cache" call anywhere. On a miss it renders once and does a
best-effort upload (a failed cache write is logged and swallowed, never fails the
user-facing download — this is error-handling bucket 2, non-critical side effect,
per CONTRIBUTING.md). If `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't configured
at all, it silently falls back to always-live-render — useful in a sandbox with no
Storage configured, but means you won't notice a real cache regression there.

**Supabase Storage buckets — verified from code, not from README.** All buckets are
created `{ public: false }` and served exclusively via short-lived signed URLs
(commit #91, "Make storage buckets private and serve via signed URLs"):

| Bucket (literal name in code) | File | Contents |
|---|---|---|
| `attachments` | `src/server/services/storage.ts` | General uploads: invoice/expense/proposal attachments. `createAttachmentSignedUrl(path, expiresInSeconds = 60)` default expiry is 60 seconds. |
| `invoice-pdfs` | `src/server/services/invoice-pdf-cache.ts` | Rendered invoice PDF cache (above) |
| `year-end-exports` | `src/server/services/year-end-export-job.ts` | Year-end CSV/PDF/ZIP export pack |

Each of these self-creates its own bucket lazily on first use (`ensureBucket()` /
`createBucket(BUCKET, { public: false })`, tolerating an "already exists" error) —
**you do not need to manually create buckets in the Supabase dashboard** for this
code to work. This directly contradicts README.md's self-hosting guide, which
instructs self-hosters to manually create four buckets named `invoices`, `expenses`,
`logos`, and `proposals`. Those four bucket names do not appear anywhere in the
service code as of this writing — treat that part of the README as stale/aspirational
and trust `storage.ts` / `invoice-pdf-cache.ts` / `year-end-export-job.ts` instead.
`storage.ts` also normalizes legacy full public-URL values (from before the
private-bucket migration) down to a bare path via `storagePathFromUrl()`, so old rows
created under the public-bucket era still resolve correctly.

Perf-index application (`scripts/apply-perf-indexes.mjs`, `scripts/check-perf-indexes.mjs`)
is a separate out-of-band maintenance step, not part of the migration or deploy
pipeline — see **lwd-diagnostics-and-tooling** for how/when to run it.

## Common mistakes

- **Editing `package.json`'s `build` script and assuming it governs deploys.** It
  doesn't — Netlify only reads `netlify.toml`'s `[build].command`. Change both or
  neither, and always keep `prisma migrate deploy` in whichever one Netlify actually
  runs.
- **Hand-editing a committed migration's `migration.sql`.** `migrate deploy` tracks
  applied migrations by name + checksum; editing after another environment applied
  it produces a checksum mismatch and refuses to deploy. Write a new migration
  instead.
- **Using `prisma db push` in any environment that also runs `migrate deploy`.**
  `db push` bypasses the `_prisma_migrations` history table; the next
  `migrate deploy` won't know that schema state came from somewhere else and can
  conflict or silently think nothing changed.
- **Forgetting to register a new Inngest function in `src/app/api/inngest/route.ts`.**
  The function file compiling and having a correct `cron`/event trigger means
  nothing if it's not in the `functions: [...]` array `serve()` is called with.
  It will simply never run, with no error anywhere.
- **Treating README.md's self-hosting bucket list or Docker step as ground truth.**
  Both were verified stale/absent against current code (see above) — when README
  and code disagree, the code (and this skill) wins; consider fixing the README as
  a follow-up rather than propagating the stale instructions.
- **Assuming a green Netlify build means the DB is in sync.** `migrate deploy` is a
  no-op (and still exits 0) if migrations are already applied — a green build tells
  you the build command ran, not that a *new* migration you expected actually
  landed. Check `prisma/migrations` history against what you intended to ship, or
  check the DB directly if in doubt.
- **Confusing the two heartbeats.** The Netlify `db-heartbeat.mts` (15 min, cold-start
  avoidance) and the GitHub Actions `supabase-heartbeat.yml` (every 4 days, anti-pause)
  solve different problems on different schedules — don't delete one thinking it
  duplicates the other.

## Provenance and maintenance

Date-stamped: 2026-07-05. All commands, paths, and code excerpts above were opened
and read directly during authoring (not recalled from training or from the seed
brief, which had some drift — see "Common mistakes" for what was corrected: the
README's four-bucket list and Docker step, and the true Inngest function count of
22 vs. the seed's "10+").

Files verified (this session):
- `netlify.toml` (full file)
- `package.json` (`scripts` block, `dependencies`/`devDependencies`)
- `netlify/functions/db-heartbeat.mts` (full file)
- `.github/workflows/supabase-heartbeat.yml` (full file)
- `prisma/migrations/` directory listing + `migration_lock.toml`
- `README.md` (features list, tech stack, self-hosting guide sections 1–9,
  troubleshooting, scripts table)
- `CONTRIBUTING.md` (development workflow, database changes, error-handling section)
- `src/app/api/inngest/route.ts` (full file — function registration)
- `src/inngest/client.ts` (full file)
- `src/inngest/functions/recurring-invoices.ts` (first 50 lines — cron trigger shape)
- `src/app/api/warmup/route.ts` (full file)
- `src/server/services/storage.ts` (full file)
- `src/server/services/invoice-pdf-cache.ts` (full file)
- `src/server/services/year-end-export-job.ts` (grep for `BUCKET`/`storage.from`)
- `src/server/services/invoice-pdf.tsx`, `proposal-pdf.tsx`, `client-statement-pdf.tsx`,
  `contractor-1099-pdf.tsx`, `year-end-pdf.tsx`, `report-pdf-generator.ts` (headers/exports)
- `src/app/api/invoices/[id]/pdf/route.ts` (full file — org-scoped fetch + cache call)
- `.env.example` (grep for `WARMUP_SECRET`, `INNGEST_*`, `*_PROVIDER`)
- Confirmed absence: no `Dockerfile` in repo root (`ls Dockerfile` → not found)

Re-verification commands (all run and confirmed working on Darwin/BSD tools during
authoring — `grep -P` is GNU-only and will error on macOS, so the function-count
check below uses `node`, not PCRE):
```bash
# netlify build command still has the migration step?
grep -n "command =" netlify.toml

# how many Inngest functions are actually registered? (portable, not grep -P)
node -e "
const fs = require('fs');
const src = fs.readFileSync('src/app/api/inngest/route.ts','utf8');
const m = src.match(/functions:\s*\[([^\]]*)\]/);
console.log(m[1].split(',').map(s=>s.trim()).filter(Boolean).length);
"
# → 22 at time of writing

# how many timestamped migration folders exist (excludes migration_lock.toml,
# which also lives in this dir and would inflate a naive `ls | grep -c` count)
find prisma/migrations -maxdepth 1 -type d ! -path prisma/migrations | wc -l
# → 73 at time of writing

# which Storage buckets does the code actually create?
grep -rn "^const BUCKET" src/server/services

# does a Dockerfile exist yet? (README references one)
ls Dockerfile 2>&1

# db-heartbeat schedule
grep -n "schedule" netlify/functions/db-heartbeat.mts

# warmup secret still wired the same way?
grep -n "WARMUP_SECRET" src/app/api/warmup/route.ts netlify/functions/db-heartbeat.mts .env.example
```

Uncertainties / candidates (not fully verified, labeled as such above too):
- README's Docker deployment step: no `Dockerfile` found in repo root at time of
  writing; labeled stale/aspirational above, not deleted from README (out of scope
  for this skill to edit README.md).
- README's four-bucket self-hosting instructions (`invoices`/`expenses`/`logos`/
  `proposals`): verified absent from all storage-related service code found via
  `grep -rn "storage.from(" src/server`; labeled stale above.
- "10+ background jobs" language in this project's own README (Platform features
  section) undercounts the literal function-array length (22); both can be true
  simultaneously (22 functions implement roughly 10+ *conceptual* jobs) — presented
  both numbers above rather than picking one.
