/**
 * Client-safe helper: turn a stored expense receipt reference into a link the
 * current user can open.
 *
 * Newer rows store an absolute /api/receipts/view app URL and pass through
 * unchanged. Rows created before the private-bucket change store a Supabase
 * public URL for the (now private) receipts bucket — those are rewritten to
 * the authenticated view route so they keep working.
 */
const LEGACY_PUBLIC_MARKER = "/storage/v1/object/public/receipts/";

export function receiptHref(stored: string): string {
  const idx = stored.indexOf(LEGACY_PUBLIC_MARKER);
  if (idx === -1) return stored;
  const path = stored.slice(idx + LEGACY_PUBLIC_MARKER.length);
  return `/api/receipts/view?path=${encodeURIComponent(path)}`;
}
