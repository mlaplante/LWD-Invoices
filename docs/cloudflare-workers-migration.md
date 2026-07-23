# Netlify → Cloudflare Workers migration

**Status: spike complete. Not currently migratable without real refactoring.**

Everything below was measured on a working spike, not estimated. Spike branch:
`spike/cloudflare-workers` (worktree `.worktrees/cf-spike`).

## Short version

The app **builds** for Workers via OpenNext, and the Worker **boots** and serves
requests on real workerd. But three things fail, and two of them are structural:

| | Verdict |
|---|---|
| Build under `@opennextjs/cloudflare` | ✅ works, after 4 changes |
| Worker boots, middleware/auth runs on workerd | ✅ verified |
| Bundle size vs 10 MB Workers Paid ceiling | ❌ **13.5 MB gzip** |
| `@react-pdf/renderer` at runtime | ❌ **WASM blocked by workerd** |
| Prisma at runtime | ❌ WASM blocked; fix path exists but doesn't build yet |
| Inngest background jobs | ⚠️ untested |

So: yes there's a path, but it's a project, not a port. The honest read is that
PDF generation cannot run on Workers as currently written, and that alone forces
an architecture change.

## Adapter choice

`@opennextjs/cloudflare` (1.20.2), **not** `@cloudflare/next-on-pages`.
next-on-pages forces the edge runtime, which this app can't take — `node:crypto`
in ten places, `pg` over TCP, `@react-pdf/renderer`. OpenNext runs Next on
Workers under `nodejs_compat`.

Confirmed: Next 16.2.11 builds under OpenNext 1.20.2.

## The two runtime blockers

Both surfaced from a smoke route (`src/app/api/cf-smoke/route.ts` in the spike)
run against real workerd via `wrangler dev`:

```json
{
  "reactPdf": "FAILED: RuntimeError: Aborted(CompileError: WebAssembly.instantiate(): Wasm code generation disallowed by embedder)",
  "prisma":   "FAILED: CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder"
}
```

Workers forbid compiling WebAssembly from bytes at runtime. WASM has to be a
static module import resolved at build time. Both libraries do the former.

### `@react-pdf/renderer` — hard blocker

This backs ten files: `invoice-pdf`, `proposal-pdf`, `year-end-pdf`,
`client-statement-pdf`, `contractor-1099-pdf`, the four `pdf-templates/*`, and
`/api/reports/tax-liability/pdf`. It bundles fine and then dies on first render.

There is no config flag for this. **PDF generation has to move off the Worker** —
a separate Node service, a container, or keeping just those routes on Netlify.
Note this is a stronger reason to offload than bundle size alone.

### Prisma — fixable in principle, not working yet

The current `prisma-client-js` generator ships a WASM query engine instantiated
from bytes. Prisma's documented answer is the newer generator:

```prisma
generator client {
  provider     = "prisma-client"
  runtime      = "workerd"
  moduleFormat = "esm"
  output       = "../src/generated/prisma"
}
```

That emits `wasm-worker-loader.mjs` — the correct static-import path. But getting
it through the build didn't land:

- It changes the entry point, so all **158 files** importing `@/generated/prisma`
  need `@/generated/prisma/client`. (Mechanical — a one-line sed did it.)
- **Turbopack** compiles the static `.wasm` import fine, but leaves
  `process.env.NODE_ENV` dynamic, and the Worker then crashes at init inside
  Next's dev-only file logger: `Dynamic require of "fs" is not supported`.
- **webpack** inlines NODE_ENV correctly (Worker boots), but needs
  `experiments.asyncWebAssembly`, and even with that set the build ends with
  `ENOENT: .next/server/static/wasm/7834c5609f074b64.wasm` — the emitted WASM
  never makes it into the OpenNext bundle.

So each builder solves what the other breaks. Resolving this is a prerequisite,
and I'd treat it as unknown-effort until someone gets one of the two paths green.

## Size

| Builder | Uncompressed | Gzipped |
|---|---|---|
| Turbopack (current default) | 71.3 MB | **16.9 MB** |
| webpack (`next build --webpack`) | 57.8 MB | **13.5 MB** |

Ceilings are 3 MB free / 10 MB paid
([limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size)).
We need to shed ~3.5 MB gzip off the webpack build.

The two largest shipped chunks are 7 MB each (1.9 MB gzip each) and both carry
OpenTelemetry, Stripe, Prisma and Supabase; the next pair carries Sentry and the
Anthropic SDK. Levers, best payoff first:

1. **`@sentry/nextjs` server SDK → `@sentry/cloudflare`.** The Node SDK drags in
   OpenTelemetry and `import-in-the-middle`. Biggest single lever, supported
   swap. (Sentry's OpenNext wiring differs from `withSentryConfig` — follow their
   Cloudflare docs rather than adapting the current config by hand.)
2. **Offloading PDF generation** removes `@react-pdf/renderer` + `fontkit` +
   satellites — and we have to do it anyway, per above.
3. **`@anthropic-ai/sdk` → plain `fetch`.** ~2 MB traced; usage is narrow.
4. **Build with `--webpack`.** Worth 3.4 MB gzip on its own, but gives up
   `turbopackFileSystemCacheForBuild`, so builds get slower.

## Build changes needed (all verified)

### 1. `src/proxy.ts` → `src/middleware.ts` — the fragile one

Next 16 renamed middleware to `proxy.ts` and pinned it to the Node runtime
("Proxy always runs on Node.js runtime"). OpenNext refuses Node middleware
("Node.js middleware is not currently supported"). The only way through is the
**deprecated** `middleware.ts` convention, which still defaults to edge. Next
warns on every build.

The body (`@supabase/ssr` auth + `@upstash/ratelimit`) needed no changes and
**was verified running on workerd** — it correctly 307'd an unauthenticated
request. But we'd be depending on a convention Next has already deprecated.

### 2. Drop `@sentry/profiling-node`

Native `.node` addons; esbuild can't bundle them, workerd can't load them.
**Server profiling goes away.** Error reporting is unaffected.

### 3. Repoint `pg-cloudflare`'s exports

`pg` needs it for TCP sockets. Its exports map is condition-split:

```
"." : { workerd: { import: "./esm/index.mjs", require: "./dist/index.js" },
        default: "./dist/empty.js" }
```

Next's nft trace runs under *node* conditions → copies only `dist/empty.js` into
`.open-next`. OpenNext's esbuild bundles under *workerd + require* → asks for
`dist/index.js`, which was never copied. Build dies with
`Could not resolve "pg-cloudflare"` even though the installed package is
complete. `scripts/patch-pg-cloudflare.mjs` collapses every condition onto
`dist/index.js`; wire it into `postinstall`. It must handle both the hoisted and
the nested `node_modules/pg/node_modules` copy.

### 4. `wrangler.jsonc` + `open-next.config.ts`

In the spike commit.

## Netlify teardown checklist

- `netlify.toml` → `wrangler.jsonc`. **Carry over the cache headers.**
  `/portal/*` and `/pay/*` are forced `private, no-store` there and *only* there
  — they're token-gated per-recipient pages. The `next.config.ts` security
  headers come across on their own; these do not. Verify with a live request
  after cutover that Cloudflare's CDN isn't caching those paths.
- **Keep `prisma migrate deploy` in the deploy path.** Load-bearing comments in
  both `package.json` and `netlify.toml` say so: dropping it drifts the live DB
  and produces "column X does not exist" 500s. The spike removed it only to
  build offline. Needs `DATABASE_URL` + network at build time, or its own CI step.
- `netlify/functions/db-heartbeat.mts` (cron `*/15`) → a Workers Cron Trigger, or
  drop it. Its job was keeping the Netlify function and Supabase pooler warm.
  Decide explicitly rather than losing it silently.
- Remove `@netlify/functions`, `@netlify/plugin-nextjs`.
- **`unstable_cache` is used heavily** (analytics, reports, dashboard routers).
  OpenNext needs an R2 or KV incremental-cache binding in `open-next.config.ts`
  or this silently stops caching.
- `src/server/db.ts` pooling (`max: 1`, `idleTimeoutMillis: 0`, `keepAlive`) is
  tuned for warm Lambda containers and doesn't map to Workers. The
  Cloudflare-native answer is **Hyperdrive** in front of Supabase feeding
  `@prisma/adapter-pg`. Confirm Prisma 7 + adapter-pg + Hyperdrive is supported
  before committing. Hyperdrive does *not* remove the `pg-cloudflare` issue —
  same driver either way.
- **Inngest is untested.** `/api/inngest` and `src/inngest/functions` back
  reminders and briefings. Needs its own smoke test.
- **CPU time** on Paid is 5 min (configurable), vs Netlify's model. The year-end,
  1099 and bulk-report routes are the ones to check.

## Secrets

22 variables are set on the Netlify site, identical across `dev` and
`production` contexts:

```
DATABASE_URL                DIRECT_DATABASE_URL         GATEWAY_ENCRYPTION_KEY
GEMINI_API_KEY              INNGEST_EVENT_KEY           INNGEST_SIGNING_KEY
NETLIFY_NEXT_CACHE_PERSIST  NEXT_PUBLIC_APP_URL         NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY                      NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL    NEXT_TELEMETRY_DISABLED     NODE_VERSION
RESEND_API_KEY              RESEND_FROM_EMAIL           SENTRY_DSN
STRIPE_SECRET_KEY           STRIPE_WEBHOOK_SECRET       SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL                WARMUP_SECRET
```

**Heads up:** several variables in `.env.example` are *not* set on Netlify —
`ANTHROPIC_API_KEY`, `PORTAL_SESSION_SECRET`, `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_*`,
`OPENAI_API_KEY`. Either those features are dormant in production or the values
live elsewhere. A straight copy of the Netlify set will not be complete.

They split three ways, and getting this wrong is the classic migration bug:

- **`NEXT_PUBLIC_*` are inlined at build time.** They must be *build* variables
  (Workers Builds → "Build variables and secrets"), not runtime Worker secrets.
  Setting them only as secrets ships a build with `undefined` baked in.
- **Netlify-specific** (`NETLIFY_NEXT_CACHE_PERSIST`, `NODE_VERSION`) — drop.
- **Everything else** → Worker secrets.

`wrangler secret bulk` accepts a JSON or `.env` file, up to 100 per call:

```sh
netlify env:list --context production --json > secrets.json   # scratch dir, not the repo
# strip NEXT_PUBLIC_* / NETLIFY_* / NODE_VERSION, then:
npx wrangler secret bulk secrets.json
rm secrets.json
```

Write to a scratch path, feed wrangler, delete — keep values out of scrollback
and out of the repo.

Also note **`NODE_ENV=production` must be set explicitly.** Without it the Worker
crashes at init inside Next's dev-only file logger (`Dynamic require of "fs" is
not supported`). Netlify set this implicitly; Cloudflare does not.

If we adopt Hyperdrive, `DATABASE_URL` becomes Hyperdrive config, not a secret.

## Open decisions

1. **Is this worth doing?** The PDF offload is mandatory and the Prisma/WASM
   build path is unresolved. That's meaningfully more than a redeploy.
2. **Which Cloudflare account**, and is it Workers Paid? Two are visible:
   `Accounting@bespokeandcofl.com` and `Michael@michaellaplante.com`. Free is
   3 MB — nowhere near enough; Paid still needs the size work.
3. **Where does PDF generation live** after the move?
4. **Accept the deprecated-middleware dependency?**
5. **Sentry server profiling goes away** — confirm that's acceptable.
6. **DNS cutover timing** off Netlify.
