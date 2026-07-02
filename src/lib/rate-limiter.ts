/**
 * Upstash-backed sliding-window limiter, shared across replicas.
 *
 * Used by `src/proxy.ts` to throttle traffic to the portal, pay, webhook,
 * v1 API, and AI endpoints at the edge before a route handler runs. If
 * Upstash env vars aren't set, getRateLimiters() returns null and the proxy
 * skips the check (dev/test mode).
 *
 * For per-route in-process limits inside a single handler (e.g. brute-force
 * protection on a passphrase check), prefer the in-memory limiter in
 * `./rate-limit.ts`.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Limiters = {
  portal: Ratelimit;
  pay: Ratelimit;
  webhook: Ratelimit;
  apiV1: Ratelimit;
  ai: Ratelimit;
};

function createRateLimiter(): Limiters | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const redis = new Redis({ url, token });

  return {
    portal: new Ratelimit({
      redis,
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:portal",
    }),
    pay: new Ratelimit({
      redis,
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:pay",
    }),
    webhook: new Ratelimit({
      redis,
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "rl:webhook",
    }),
    // Cross-replica backstop for /api/v1: the in-process limiter in
    // src/app/api/v1/auth.ts is per instance, so its effective ceiling
    // multiplies with replica count. This edge limit holds globally.
    apiV1: new Ratelimit({
      redis,
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      prefix: "rl:api-v1",
    }),
    // Cross-replica backstop for LLM-backed endpoints: the per-org budget
    // caps in src/server/lib/ai-rate-limit.ts are in-process, so this edge
    // limit is what actually bounds spend across replicas / cold starts.
    ai: new Ratelimit({
      redis,
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:ai",
    }),
  };
}

let rateLimiters: Limiters | null = null;
let initialized = false;

export function getRateLimiters(): Limiters | null {
  if (!initialized) {
    rateLimiters = createRateLimiter();
    initialized = true;
  }
  return rateLimiters;
}

export type RateLimitBucket = "portal" | "pay" | "webhook" | "apiV1" | "ai";

export function getBucketForPath(pathname: string): RateLimitBucket | null {
  // The /api/* prefixes matter as much as the page routes: the actual
  // brute-forceable endpoints are API routes (/api/portal/[token]/auth for
  // passphrase guessing, /api/pay/[token]/charge-saved for card charging),
  // which the bare /portal and /pay prefixes do not match.
  if (pathname.startsWith("/portal") || pathname.startsWith("/api/portal")) {
    return "portal";
  }
  if (pathname.startsWith("/pay") || pathname.startsWith("/api/pay")) {
    return "pay";
  }
  if (pathname.startsWith("/api/webhooks")) return "webhook";
  if (pathname.startsWith("/api/v1")) return "apiV1";
  if (
    pathname.startsWith("/api/assistant") ||
    pathname.startsWith("/api/expenses/receipt/ocr")
  ) {
    return "ai";
  }
  return null;
}
