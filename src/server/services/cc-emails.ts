const MAX_CC_RECIPIENTS = 10;
// Loose RFC 5322 — same level of strictness as the client form input. We're
// gating user-typed values, not parsing arbitrary headers.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Splits a user-provided string (comma, semicolon, whitespace, or newline
 * separated) into a trimmed list of email-shaped tokens. Invalid entries are
 * dropped silently — the form does inline validation before submit.
 */
export function parseCcInput(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

/**
 * Normalizes a CC list for sending: lowercases, dedupes, drops any address
 * equal to the primary `to` recipient, and caps at MAX_CC_RECIPIENTS.
 */
export function sanitizeCcList(cc: string[] | undefined | null, to: string | string[]): string[] {
  if (!cc || cc.length === 0) return [];
  const toSet = new Set(
    (Array.isArray(to) ? to : [to]).map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cc) {
    const addr = raw.trim().toLowerCase();
    if (!addr || !EMAIL_RE.test(addr) || toSet.has(addr) || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
    if (out.length >= MAX_CC_RECIPIENTS) break;
  }
  return out;
}

export { MAX_CC_RECIPIENTS };
