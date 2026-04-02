import { randomBytes } from "crypto";

/** Session duration: 30 days in milliseconds */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a portal session has expired.
 * Returns true if expiresAt is in the past or exactly now.
 */
export function isSessionExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Generate a cryptographically secure session token (32 bytes / 64 hex chars).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
