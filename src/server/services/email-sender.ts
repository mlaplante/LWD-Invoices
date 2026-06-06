import { db } from "@/server/db";
import { getOwnerBcc } from "./email-bcc";

export type SendEmailOptions = {
  organizationId: string;
  to: string | string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  /**
   * When the email relates to a specific invoice, pass its id. It's sent as an
   * `invoice_id` Resend tag that the webhook handler reads back to attribute
   * delivery/open/click events to the invoice — powering the engagement timeline
   * and the "viewed but unpaid" reminder trigger.
   */
  invoiceId?: string;
};

export type SendEmailResult =
  | { resendId: string | null; suppressed?: false }
  | { resendId: null; suppressed: true; reason: "bounced" | "complained" };

/**
 * Sends an email via Resend with org owner BCC (if enabled).
 * Centralizes Resend instantiation, from address, BCC logic, and the
 * `org_id` tag that the Resend webhook handler uses to attribute
 * delivery/open/click events back to the org.
 *
 * Suppresses sends to recipients whose Client row has emailBouncedAt or
 * emailComplainedAt set — Resend would charge us anyway and a hard bounce
 * looped back via webhook proves the address is unreachable. Returns
 * { suppressed: true } so callers can decide whether to surface the skip.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const flagged = await db.client.findFirst({
    where: {
      organizationId: opts.organizationId,
      email: { in: recipients },
      OR: [{ emailBouncedAt: { not: null } }, { emailComplainedAt: { not: null } }],
    },
    select: { emailBouncedAt: true, emailComplainedAt: true },
  });
  if (flagged) {
    const reason = flagged.emailBouncedAt ? "bounced" : "complained";
    console.error(`[email-sender] Suppressed send to ${reason} recipient`);
    return { resendId: null, suppressed: true, reason };
  }

  // Drop CC addresses that belong to a bounced/complained client in this org.
  // The primary recipient is the hard block above — CCs are best-effort, so
  // we silently filter rather than aborting the whole send.
  let cc = opts.cc && opts.cc.length > 0 ? opts.cc : undefined;
  if (cc) {
    const flaggedCcs = await db.client.findMany({
      where: {
        organizationId: opts.organizationId,
        email: { in: cc },
        OR: [{ emailBouncedAt: { not: null } }, { emailComplainedAt: { not: null } }],
      },
      select: { email: true },
    });
    if (flaggedCcs.length > 0) {
      const flaggedSet = new Set(flaggedCcs.map((c) => c.email).filter(Boolean) as string[]);
      cc = cc.filter((addr) => !flaggedSet.has(addr));
    }
    if (cc.length === 0) cc = undefined;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const bcc = await getOwnerBcc(opts.organizationId);

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    tags: [
      { name: "org_id", value: opts.organizationId },
      ...(opts.invoiceId ? [{ name: "invoice_id", value: opts.invoiceId }] : []),
    ],
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return { resendId: result.data?.id ?? null };
}
