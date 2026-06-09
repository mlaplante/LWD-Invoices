import bcrypt from "bcryptjs";
import { createRateLimiter, createLockoutTracker } from "./rate-limit";

/**
 * Shared brute-force protection for the client portal auth endpoints
 * (/api/portal/[token]/auth and /api/portal/dashboard/[clientToken]/auth).
 */

// Identical 401 body for "token not found" and "wrong passphrase" so an
// attacker can't enumerate valid portal tokens by response shape.
export const GENERIC_PORTAL_AUTH_ERROR = { error: "Invalid token or passphrase" };

// Bcrypt-format dummy hash used to keep request latency constant when the
// record/passphrase isn't found, preventing enumeration via timing.
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

/** Burn a bcrypt compare against a dummy hash to keep timing flat. */
export async function burnBcryptCompare(passphrase: string): Promise<void> {
  await bcrypt.compare(passphrase, DUMMY_HASH);
}

/**
 * One guard instance per route module: 10 attempts per key per 15 minutes,
 * plus a full lockout for 15 minutes after 5 failed passphrase attempts.
 */
export function createPortalAuthGuard() {
  return {
    limiter: createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
    lockout: createLockoutTracker({ maxFailures: 5, lockoutMs: 15 * 60_000 }),
  };
}
