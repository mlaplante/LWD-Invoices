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

// Hard cap on tracked keys so an attacker cycling through unique keys
// (tokens, IPs) can't grow the maps without bound and exhaust the heap.
const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const map = new Map<string, number[]>();

  function prune(now: number) {
    if (map.size < maxKeys) return;
    for (const [k, timestamps] of map) {
      if (!timestamps.some((t) => now - t < opts.windowMs)) map.delete(k);
    }
    // Still full of live keys — evict oldest entries (Map preserves insertion
    // order) so the process stays bounded even under active flooding.
    while (map.size >= maxKeys) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }

  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      const timestamps = (map.get(key) ?? []).filter(
        (t) => now - t < opts.windowMs,
      );
      if (timestamps.length >= opts.limit) return true;
      prune(now);
      timestamps.push(now);
      map.set(key, timestamps);
      return false;
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * In-memory failed-attempt lockout tracker (brute-force protection).
 *
 * Complements `createRateLimiter`: the limiter throttles request volume,
 * the lockout blocks a key entirely after repeated *failures* (e.g. wrong
 * passphrase) until the lockout window passes. Same in-process caveats as
 * the limiter above.
 */
export function createLockoutTracker(opts: {
  maxFailures: number;
  lockoutMs: number;
  maxKeys?: number;
}) {
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const failures = new Map<string, { count: number; lockedUntil: number; lastFailureAt: number }>();

  function prune(now: number) {
    if (failures.size < maxKeys) return;
    for (const [k, v] of failures) {
      // Drop entries whose lockout has lapsed or that have been idle long
      // enough that the failure streak is stale.
      if (v.lockedUntil < now && now - v.lastFailureAt > opts.lockoutMs) {
        failures.delete(k);
      }
    }
    while (failures.size >= maxKeys) {
      const oldest = failures.keys().next().value;
      if (oldest === undefined) break;
      failures.delete(oldest);
    }
  }

  return {
    /** Seconds until the key may retry, or null if not locked out. */
    retryAfterSeconds(key: string): number | null {
      const entry = failures.get(key);
      if (!entry) return null;
      const now = Date.now();
      if (entry.count >= opts.maxFailures && now < entry.lockedUntil) {
        return Math.ceil((entry.lockedUntil - now) / 1000);
      }
      return null;
    },
    recordFailure(key: string) {
      const now = Date.now();
      prune(now);
      const entry = failures.get(key) ?? { count: 0, lockedUntil: 0, lastFailureAt: 0 };
      entry.count += 1;
      entry.lastFailureAt = now;
      if (entry.count >= opts.maxFailures) {
        entry.lockedUntil = now + opts.lockoutMs;
      }
      failures.set(key, entry);
    },
    reset(key: string) {
      failures.delete(key);
    },
    clear() {
      failures.clear();
    },
  };
}
