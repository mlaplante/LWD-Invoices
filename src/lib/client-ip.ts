/**
 * Best-effort client IP for rate-limit keys and audit fields.
 *
 * Prefer Netlify's `x-nf-client-connection-ip`, which the platform sets and a
 * client cannot spoof. Fall back to the LAST x-forwarded-for hop (appended by
 * the nearest trusted proxy) — never the first, which is whatever the client
 * chose to send and would let a caller mint a fresh rate-limit bucket per
 * request.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-nf-client-connection-ip") ??
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
