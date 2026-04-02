/**
 * In-memory sliding-window rate limiter.
 * Each instance tracks its own key space with independent limits.
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
