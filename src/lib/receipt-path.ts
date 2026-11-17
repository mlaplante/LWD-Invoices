// The file segment uploadReceipt() generates: a UUID plus a short extension.
const RECEIPT_FILE_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/;

/**
 * True only when `path` is exactly `${orgId}/${uuid}.${ext}`. This is the
 * access check for caller-supplied receipt paths: it rejects traversal
 * (`..`, encoded or not), extra segments, and anything outside the org's
 * own folder.
 */
export function isReceiptPathForOrg(path: string, orgId: string): boolean {
  if (!orgId || !path.startsWith(`${orgId}/`)) return false;
  return RECEIPT_FILE_RE.test(path.slice(orgId.length + 1));
}
