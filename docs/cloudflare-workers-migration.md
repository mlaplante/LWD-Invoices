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
| Bundle size vs 10 MB Workers Paid ceiling | ❌ **13.5 MB gzip** (measured *with* react-pdf still in) |
| `@react-pdf/renderer` at runtime | ❌ **WASM blocked by workerd — no fix** |
| Prisma at runtime | ⚠️ WASM prohibition cleared; blocked on asset bundling |
| Inngest background jobs | ⚠️ untested |

So: yes there's a path, but it's a project, not a port. The one genuinely
unfixable item is `@react-pdf/renderer` — PDF generation cannot run on Workers
as currently written, and that alone forces an architecture change.

The other two are softer than the table suggests, and they're coupled: the
13.5 MB was measured with react-pdf and `fontkit` still in the bundle, so the
mandatory PDF offload plus the Sentry→`@sentry/cloudflare` swap are attacking
the size number too. Size is not a standalone wall.

## Adapter choice

`@opennextjs/cloudflare` (1.20.2), **not** `@cloudflare/next-on-pages`.
next-on-pages forces the edge runtime, which this app can't take — `node:crypto`
in ten places, `pg` over TCP, `@react-pdf/renderer`. OpenNext runs Next on
Workers under `nodejs_compat`.

Confirmed: Next 16.2.11 builds under OpenNext 1.20.2.

## Runtime findings

All from a smoke route (`src/app/api/cf-smoke/route.ts` in the spike) run against
real workerd via `wrangler dev`. Workers forbid compiling WebAssembly from bytes
at runtime — WASM must be a static module import resolved at build time.

### `@react-pdf/renderer` — hard blocker, no fix

```
RuntimeError: Aborted(CompileError: WebAssembly.instantiate():
Wasm code generation disallowed by embedder)
```

Reproduced on every build variant tried. It bundles fine and dies on first
render. This backs ten files: `invoice-pdf`, `proposal-pdf`, `year-end-pdf`,
`client-statement-pdf`, `contractor-1099-pdf`, the four `pdf-templates/*`, and
`/api/reports/tax-liability/pdf`.

There is no config flag for this. **PDF generation has to move off the Worker** —
a separate Node service, a container, or keeping just those routes on Netlify.

### Prisma — the platform prohibition is cleared; bundling isn't

With the stock `prisma-client-js` generator, Prisma failed the same way as
react-pdf (`Wasm code generation disallowed by embedder`). Switching to the
generator Prisma documents for Workers fixes that:

```prisma
generator client {
  provider     = "prisma-client"
  runtime      = "workerd"
  moduleFormat = "esm"
  output       = "../src/generated/prisma"
}
```

After that switch the runtime error changes to:

```
no such file or directory, readAll '/bundle/static/wasm/7834c5609f074b64.wasm'
```

That is the important result: **the engine loads and runs under workerd — it just
can't find its `.wasm` inside the OpenNext bundle.** Categorically different from
react-pdf, and an asset-plumbing problem rather than a platform limit.

What it costs, and what's still open:

- The generator changes the entry point, so all **158 files** importing
  `@/generated/prisma` need `@/generated/prisma/client`. Mechanical — a one-line
  sed did it.
- webpack emits the file at `.next/server/chunks/static/wasm/…` but the runtime
  looks for `/bundle/static/wasm/…`. Copying it into `.next/server/static/wasm/`
  before OpenNext's bundling step clears the build-time ENOENT, but the file
  still doesn't land where the worker's FS shim looks. `outputFileTracingIncludes`
  didn't help either. **Unresolved — but the remaining gap is one path, not a
  redesign.** Someone should finish this before any go/no-go call.
- Note the query-compiler WASM is 3.5 MB uncompressed, which counts against the
  size budget.

### Turbopack doesn't boot on workerd (independent of Prisma)

With the Turbopack builder, `process.env.NODE_ENV` is left dynamic and the Worker
crashes at init inside Next's dev-only file logger:

```
Error: Dynamic require of "fs" is not supported
  at next/dist/server/dev/browser-logs/file-logger.js
```

This kills *every* route, not just Prisma. webpack inlines NODE_ENV and boots
fine. So webpack is the required builder for a second reason beyond size — and
Turbopack is the only builder that natively compiles Prisma's static `.wasm`
import, which is exactly the tension above.

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

The body (`@supabase/ssr` auth + `@upstash/ratelimit`) needed no changes and ran
on workerd — **partially verified**: it correctly 307'd an unauthenticated
request, which proves the middleware executes and Supabase SSR initializes. A
full authed pass-through and the Upstash limiter were not exercised. Either way
we'd be depending on a convention Next has already deprecated.

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

1. **Is this worth doing?** The PDF offload is mandatory. That plus the Sentry
   swap is meaningfully more than a redeploy — but it's bounded work, and it
   also brings the size number down.
2. **Finish the Prisma WASM bundling first** before any go/no-go. It's the data
   layer, and it's one unresolved path away from working.
3. **Which Cloudflare account**, and is it Workers Paid? Two are visible:
   `Accounting@bespokeandcofl.com` and `Michael@michaellaplante.com`. Free is
   3 MB — nowhere near enough; Paid still needs the size work.
4. **Where does PDF generation live** after the move?
5. **Accept the deprecated-middleware dependency?**
6. **Sentry server profiling goes away** — confirm that's acceptable.
7. **DNS cutover timing** off Netlify.
