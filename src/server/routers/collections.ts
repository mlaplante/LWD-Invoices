import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import { generateSmartReminderDraft } from "@/server/services/smart-reminder-drafts";
import { getClientPaymentBehaviorSummary } from "@/server/services/client-payment-score";
import { sendEmail } from "@/server/services/email-sender";

// Built-in fallback reminder template. The smart drafter (Gemini-first) rephrases
// it per the selected tone and runs the fact guard; if AI is unavailable it
// interpolates this template directly. Placeholders match interpolateTemplate.
const DEFAULT_TEMPLATE = {
  subject: "Reminder: invoice {{invoiceNumber}} from {{orgName}}",
  body: [
    "Hi {{clientName}},",
    "",
    "This is a friendly reminder that invoice {{invoiceNumber}} for {{amountDue}} was due on {{dueDate}}.",
    "You can review and pay it online here: {{paymentLink}}",
    "",
    "Thank you,",
    "{{orgName}}",
  ].join("\n"),
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const collectionsRouter = router({
  /**
   * Generate a review-ready reminder draft for one invoice. Uses the
   * smart-reminder drafter (Gemini-first model-fallback chain), which picks a
   * tone from the client's payment history and guards against hallucinated
   * facts. Never sends — the UI shows it for review.
   */
  draftReminder: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: {
          client: { select: { id: true, name: true, email: true } },
          currency: { select: { code: true } },
          organization: { select: { name: true, smartRemindersThreshold: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (!invoice.dueDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice needs a due date before drafting a reminder" });
      }

      const paymentProfile = await getClientPaymentBehaviorSummary(ctx.db, invoice.client.id);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";
      const now = new Date();
      const dueMidnight = Date.UTC(invoice.dueDate.getUTCFullYear(), invoice.dueDate.getUTCMonth(), invoice.dueDate.getUTCDate());
      const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

      const draft = await generateSmartReminderDraft({
        invoice: {
          invoiceNumber: invoice.number,
          amountDue: Number(invoice.total).toFixed(2),
          currencyCode: invoice.currency.code,
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          daysOverdue: Math.max(0, Math.round((nowMidnight - dueMidnight) / 86400000)),
          paymentUrl: `${appUrl}/portal/${invoice.portalToken}`,
        },
        template: DEFAULT_TEMPLATE,
        organization: invoice.organization,
        paymentProfile,
        reliablePayerThreshold: invoice.organization.smartRemindersThreshold,
      });

      return {
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        source: draft.source,
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
      };
    }),

  /**
   * Send a (reviewed) reminder for one invoice. Tags the send with the invoice
   * id so delivery/open/click events thread back through the engagement
   * pipeline, and honors the bounce/complaint suppression in sendEmail.
   */
  sendReminder: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        invoiceId: z.string(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true, organizationId: true, client: { select: { email: true } } },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (!invoice.client.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This client has no email address on file" });
      }

      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;white-space:pre-wrap;line-height:1.5">${escapeHtml(input.body)}</div>`;

      const result = await sendEmail({
        organizationId: invoice.organizationId,
        to: invoice.client.email,
        subject: input.subject,
        html,
        invoiceId: invoice.id,
      });

      if ("suppressed" in result && result.suppressed) {
        return { sent: false, suppressed: true, reason: result.reason };
      }
      return { sent: true, suppressed: false as const };
    }),
});
