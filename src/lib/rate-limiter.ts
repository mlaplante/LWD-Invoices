import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function createRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return {
    portal: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:portal",
    }),
    pay: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:pay",
    }),
    webhook: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "rl:webhook",
    }),
  };
}

let rateLimiters: ReturnType<typeof createRateLimiter> = null;

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
