import { getOwnerBcc } from "./email-bcc";

export type SendEmailOptions = {
  organizationId: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Sends an email via Resend with org owner BCC (if enabled).
 * Centralizes Resend instantiation, from address, BCC logic, and the
 * `org_id` tag that the Resend webhook handler uses to attribute
 * delivery/open/click events back to the org.
 *
 * Returns the Resend message id when available so callers can correlate
 * later EmailEvent rows.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ resendId: string | null }> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const bcc = await getOwnerBcc(opts.organizationId);

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    tags: [{ name: "org_id", value: opts.organizationId }],
    ...(bcc ? { bcc } : {}),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return { resendId: result.data?.id ?? null };
}
