import { Ratelimit } from "@upstash/ratelimit";

function createRateLimiter() {
  return {
    portal: new Ratelimit({
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:portal",
    }),
    pay: new Ratelimit({
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:pay",
    }),
    webhook: new Ratelimit({
      ephemeralCache: new Map(),
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "rl:webhook",
    }),
  };
}

let rateLimiters: ReturnType<typeof createRateLimiter> | null = null;

export function getRateLimiters() {
  if (rateLimiters === null) {
    rateLimiters = createRateLimiter();
  }
  return rateLimiters;
}

export type RateLimitBucket = "portal" | "pay" | "webhook";

export function getBucketForPath(pathname: string): RateLimitBucket | null {
  if (pathname.startsWith("/portal")) return "portal";
  if (pathname.startsWith("/pay")) return "pay";
  if (pathname.startsWith("/api/webhooks")) return "webhook";
  return null;
}
