/**
 * In-memory sliding-window rate limiter.
 *
 * Use this for **per-route, in-process** limits — e.g. one limiter instance
 * created at module scope inside an API route. Counters live in the calling
 * Node process, so each serverless instance has its own key space; the limit
 * is effectively per instance × replicas.
 *
 * For cross-instance limits at the edge (portal/pay/webhooks), use the
 * Upstash-backed limiter in `./rate-limiter.ts` instead — it's invoked from
 * `src/proxy.ts` before requests reach a route.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
}) {
  const map = new Map<string, number[]>();

  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      const timestamps = (map.get(key) ?? []).filter(
        (t) => now - t < opts.windowMs,
      );
      if (timestamps.length >= opts.limit) return true;
      timestamps.push(now);
      map.set(key, timestamps);
      return false;
    },
    clear() {
      map.clear();
    },
  };
}
