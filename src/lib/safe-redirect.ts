/**
 * Open-redirect guard for user-supplied post-auth destinations (?redirect=,
 * ?next=). Only same-origin paths pass: must start with a single "/" —
 * "//evil.com" (protocol-relative) and "/\evil.com" (backslash-normalized by
 * some browsers) are rejected. Anything else falls back to the given default.
 *
 * Safe for both client components and route handlers.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
