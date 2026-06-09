import { createHash, randomBytes } from "crypto";

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

/**
 * SHA-256 digest (hex) of a token, for at-rest storage of single-use secrets
 * like passphrase-reset tokens. The plaintext lives only in the emailed link;
 * lookups hash the presented token and match on the digest, so a database
 * leak doesn't expose usable tokens.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
