import "server-only";
import { stripQuotedReply } from "./inbound-email";

/**
 * Resend's `email.received` webhook carries metadata only — no body, no
 * headers, no authentication verdicts (see
 * https://resend.com/docs/webhooks/emails/received). The full message, and
 * the SPF/DKIM/DMARC results Resend's receiving server computed, come from
 * `GET /emails/receiving/{id}`.
 *
 * Called with plain fetch rather than the SDK: the installed `resend`
 * version's GetReceivingEmailResponseSuccess type predates the
 * `authentication` field.
 */

export type AuthVerdict = "pass" | "fail" | "gray" | "processing_failed" | "unknown";

export interface ReceivedEmailAuthentication {
  spf: AuthVerdict | null;
  dkim: AuthVerdict | null;
  dmarc: AuthVerdict | null;
}

export interface ReceivedEmail {
  id: string;
  from: string | null;
  bodyText: string | null;
  authentication: ReceivedEmailAuthentication | null;
}

const VERDICTS = new Set<AuthVerdict>(["pass", "fail", "gray", "processing_failed", "unknown"]);

function verdict(value: unknown): AuthVerdict | null {
  return typeof value === "string" && VERDICTS.has(value as AuthVerdict)
    ? (value as AuthVerdict)
    : null;
}

/**
 * Plain-text body for a ticket message. Prefer the text part; if the message
 * only has HTML, reduce it to text — raw HTML must never be stored into a
 * ticket message, which is rendered back to staff.
 */
export function extractBodyText(text: unknown, html: unknown): string | null {
  if (typeof text === "string" && text.trim()) return stripQuotedReply(text);
  if (typeof html !== "string" || !html.trim()) return null;
  const plain = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return plain ? stripQuotedReply(plain) : null;
}

/**
 * True only when Resend's receiving server authenticated the From domain.
 *
 * - DKIM `pass` means a valid signature whose signing domain matches the From
 *   domain (Resend reports a non-matching signer as `gray`).
 * - DMARC `pass` means SPF or DKIM passed *aligned* with the From domain.
 * - SPF alone is not enough: it authenticates the envelope sender, not the
 *   From header a spoofer controls.
 *
 * Everything else — `gray`, `fail`, `unknown`, `processing_failed`, or no
 * verdict at all — is treated as unauthenticated.
 */
export function isFromDomainAuthenticated(
  auth: ReceivedEmailAuthentication | null | undefined,
): boolean {
  return auth?.dkim === "pass" || auth?.dmarc === "pass";
}

/**
 * Fetch a received email. Returns null on any failure (missing API key,
 * network error, non-2xx, malformed JSON); callers treat that as
 * "unverified" and fail closed.
 */
export async function fetchReceivedEmail(
  emailId: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ReceivedEmail | null> {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return null;
  const doFetch = opts.fetchImpl ?? fetch;

  try {
    const res = await doFetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) {
      console.error("[resend-webhook] Retrieve received email failed", {
        emailId,
        status: res.status,
      });
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data?.id !== "string" || data.id !== emailId) return null;

    const rawAuth = data.authentication as Record<string, unknown> | null | undefined;
    return {
      id: data.id,
      from: typeof data.from === "string" ? data.from : null,
      bodyText: extractBodyText(data.text, data.html),
      authentication: rawAuth
        ? {
            spf: verdict(rawAuth.spf),
            dkim: verdict(rawAuth.dkim),
            dmarc: verdict(rawAuth.dmarc),
          }
        : null,
    };
  } catch (err) {
    console.error("[resend-webhook] Retrieve received email errored", {
      emailId,
      cause: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
