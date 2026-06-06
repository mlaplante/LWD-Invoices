/**
 * Inbound email parsing helpers (provider-agnostic, pure, unit-tested).
 *
 * Outbound invoice emails carry a Reply-To of reply+<invoiceId>@<inbound-domain>.
 * When a client replies, the provider posts the message to the inbound webhook;
 * these helpers normalize the (loosely-typed) provider payload and recover the
 * invoice id from the recipient address so the webhook can thread the reply.
 */

export interface ParsedInboundEmail {
  fromEmail: string;
  toAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  messageId: string | null;
  inReplyTo: string | null;
}

type LooseAddress = string | { address?: string; email?: string } | null | undefined;

function addressString(value: LooseAddress): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  return (value.address ?? value.email ?? "").trim() || null;
}

function addressList(value: unknown): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => addressString(v as LooseAddress))
    .filter((v): v is string => !!v);
}

/**
 * Recover the invoice id from a reply+<invoiceId>@domain recipient address.
 * Returns the first match across the given recipients, or null.
 */
export function extractInvoiceIdFromRecipients(addresses: string[]): string | null {
  for (const addr of addresses) {
    const local = addr.split("@")[0]?.toLowerCase();
    if (!local) continue;
    // Accept reply+<id> (plus-addressing) or reply-<id> (some providers rewrite +).
    const match = local.match(/^reply[+-](.+)$/);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * Trim a quoted reply chain so the stored body is just the new message. Cuts at
 * the first common quote marker ("On ... wrote:", a "> " block, or a hard
 * separator). Best-effort — falls back to the full text.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const cutPatterns = [
    /^On .+ wrote:$/i,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^_{5,}$/,
    /^From: .+/i,
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (cutPatterns.some((re) => re.test(line))) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  // Drop a trailing block of quoted (">"-prefixed) lines.
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === "" || lines[end - 1].startsWith(">"))) {
    end--;
  }
  return lines.slice(0, end).join("\n").trim() || text.trim();
}

export function parseInboundPayload(payload: unknown): ParsedInboundEmail {
  const root = (payload ?? {}) as Record<string, unknown>;
  // Providers nest the email under `data` (Resend) or send it flat.
  const data = (root.data ?? root) as Record<string, unknown>;
  const headers = (data.headers ?? {}) as Record<string, unknown>;

  const fromEmail = addressString(data.from as LooseAddress) ?? "";
  const toAddresses = addressList(data.to);
  const subjectRaw = data.subject;
  const subject = typeof subjectRaw === "string" && subjectRaw.trim() ? subjectRaw.trim() : null;

  const textRaw = (data.text ?? data.plain ?? data.body) as unknown;
  const bodyText = typeof textRaw === "string" && textRaw.trim() ? stripQuotedReply(textRaw) : null;

  const messageId =
    (typeof data.message_id === "string" && data.message_id) ||
    (typeof headers["message-id"] === "string" && (headers["message-id"] as string)) ||
    null;
  const inReplyTo =
    (typeof data.in_reply_to === "string" && data.in_reply_to) ||
    (typeof headers["in-reply-to"] === "string" && (headers["in-reply-to"] as string)) ||
    null;

  return { fromEmail, toAddresses, subject, bodyText, messageId, inReplyTo };
}
