/**
 * Open-redirect guard for user-supplied post-auth destinations (?redirect=,
 * ?next=). Only same-origin paths pass: must start with a single "/" —
 * "//evil.com" (protocol-relative) and "/\evil.com" (backslash-normalized by
 * some browsers) are rejected. Anything else falls back to the given default.
 *
 * Per the WHATWG URL spec, browsers strip ASCII tab/newline (\t \n \r) from a
 * URL *before* parsing, so "/\t/evil.com" collapses to "//evil.com" once a
 * caller resolves it (e.g. `location.href = x`). Reject any input containing
 * C0 control characters so those normalization bypasses can't slip through.
 *
 * Safe for both client components and route handlers.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeRedirectPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback;
  if (CONTROL_CHARS.test(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
