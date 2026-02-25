import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signs a portal token with the app secret to create a session cookie value.
 * The cookie proves the visitor authenticated for this specific portal token,
 * without exposing the passphrase hash.
 */
export function signPortalSession(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Verifies a portal session cookie value using a timing-safe comparison.
 */
export function verifyPortalSession(
  cookieVal: string,
  token: string,
  secret: string,
): boolean {
  const expected = signPortalSession(token, secret);
  try {
    return timingSafeEqual(Buffer.from(cookieVal, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
