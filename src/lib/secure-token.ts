import { randomBytes } from "crypto";

/**
 * Cryptographically strong bearer token (32 bytes / 64 hex chars, URL-safe).
 *
 * Use this for any secret that grants access on its own — portal links,
 * invitation tokens, session tokens — instead of Prisma's @default(cuid()),
 * which is timestamp-based and therefore guessable across a time window.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}
