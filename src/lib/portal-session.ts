import { createHmac, timingSafeEqual } from "crypto";
import { generateSecureToken } from "./secure-token";

/**
 * Signs a portal token with the app secret to create a session cookie value.
 * The cookie proves the visitor authenticated for this specific portal token,
 * without exposing the passphrase hash.
 */
export function signPortalSession(
  token: string,
  secret: string,
  maxAgeSeconds: number = 60 * 60 * 24 * 30,
): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const mac = createHmac("sha256", secret).update(`${token}.${exp}`).digest("hex");
  return `${exp}.${mac}`;
}

/**
 * Verifies a portal session cookie value using a timing-safe comparison.
 * The cookie embeds its own expiry, signed alongside the token, so a
 * leaked cookie cannot be replayed forever and the expiry can't be tampered.
 */
export function verifyPortalSession(
  cookieVal: string,
  token: string,
  secret: string,
): boolean {
  const dot = cookieVal.indexOf(".");
  if (dot === -1) return false;
  const expStr = cookieVal.slice(0, dot);
  const mac = cookieVal.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", secret).update(`${token}.${exp}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Cryptographically strong portal token (32 bytes / 64 hex chars, URL-safe).
 * Used for invoice/client portalToken fields so new rows don't rely on
 * Prisma's @default(cuid()), which is timestamp-based and therefore guessable
 * across a time window.
 *
 * Existing rows seeded with cuid() should be rotated via rotatePortalToken
 * when a leak is suspected.
 */
export function generatePortalToken(): string {
  return generateSecureToken();
}

/**
 * Resolves the HMAC secret used for portal session cookies. Prefer
 * PORTAL_SESSION_SECRET (dedicated, rotatable independently). Fall back to
 * SUPABASE_SERVICE_ROLE_KEY for back-compat with deployments that haven't
 * provisioned the new variable yet.
 *
 * Server-only — never call from the browser, the keys are not public.
 */
export function getPortalSessionSecret(): string {
  // Read directly from process.env so this module stays free of next/env
  // wrappers and remains importable from edge/server code paths.
  const dedicated = process.env.PORTAL_SESSION_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) {
    throw new Error(
      "Portal session secret missing: set PORTAL_SESSION_SECRET (preferred) or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return fallback;
}
