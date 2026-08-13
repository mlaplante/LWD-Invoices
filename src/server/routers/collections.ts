import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { unstable_cache } from "next/cache";
import { router, requireRole } from "../trpc";
import type { db as Db } from "../db";
import { orgTag, invalidateOrg } from "../cached";
import { generateSmartReminderDraft } from "@/server/services/smart-reminder-drafts";
import {
  getClientPaymentBehaviorSummary,
  getClientPaymentBehaviorSummaries,
} from "@/server/services/client-payment-score";
import { sendEmail } from "@/server/services/email-sender";
import { InvoiceStatus } from "@/generated/prisma";
import { scoreCollectionRisk, rankCollectionsQueue } from "@/server/services/collection-risk";
import { escapeHtml } from "@/server/services/automation-template";
import { assertAiRateLimit } from "@/server/lib/ai-rate-limit";

// The ranked queue is a whole-org scan (open invoices + relations + the
// paid-invoice behavior scan). Since the redesign it renders on the invoices
// list (SmartCollectionsStrip) and the AI hub (AiAgentCards) as well as
// /collections, so it's cached per-org with the same passive-TTL strategy the
// analytics router uses — 60s of staleness is fine for a ranking. sendReminder
// invalidates the tag so a just-sent reminder is reflected immediately.
const COLLECTIONS_QUEUE_TTL = 60;
const collectionsTag = (orgId: string) => orgTag(orgId, "collections");

// Full ranked queue (uncapped); callers slice to their own limit so every
// limit shares one cache entry. The payload is JSON-safe (strings/numbers/
// booleans/null only), which unstable_cache's JSON serialization requires.
const getRankedCollectionsQueue = (db: typeof Db, orgId: string) =>
  unstable_cache(
    async () => {
      const now = Date.now();
      const dayMs = 86400000;

      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { smartRemindersThreshold: true },
      });
      const threshold = org?.smartRemindersThreshold ?? 80;

      // Open, non-archived invoices with a due date and a potentially-owing balance.
      const invoices = await db.invoice.findMany({
        where: {
          organizationId: orgId,
          isArchived: false,
          dueDate: { not: null },
          status: {
            in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
          },
        },
        select: {
          id: true,
          number: true,
          total: true,
          dueDate: true,
          clientId: true,
          client: { select: { id: true, name: true } },
          // Actual payment receipts — used for balance calculation.
          payments: { select: { amount: true } },
          // Installment-schedule reminders and manual follow-ups.
          manualReminders: { select: { sentAt: true } },
          reminderLogs: { select: { sentAt: true } },
          // Only opened/clicked matter to the score; delivered/bounced rows
          // (the bulk of EmailEvent) stay in the database.
          emailEvents: {
            where: { type: { in: ["email.opened", "email.clicked"] } },
            select: { type: true },
          },
        },
        take: 200,
      });

      // Filter to invoices with a real outstanding balance.
      const withBalance = invoices.flatMap((inv) => {
        const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(inv.total) - paid;
        if (balance <= 0) return [];
        return [{ inv, balance }];
      });

      // Fetch all distinct clients' payment-behavior summaries in a single query
      // (instead of one round-trip per client) to score the whole queue cheaply.
      const clientIds = [...new Set(withBalance.map((x) => x.inv.clientId))];
      const behaviorMap = await getClientPaymentBehaviorSummaries(db, clientIds);

      const scores = withBalance.map(({ inv, balance }) => {
        const behavior = behaviorMap.get(inv.clientId)!;
        const reminderDates = [
          ...inv.manualReminders.map((r) => r.sentAt.getTime()),
          ...inv.reminderLogs.map((r) => r.sentAt.getTime()),
        ];
        const lastReminder = reminderDates.length ? Math.max(...reminderDates) : null;
        const dueMs = inv.dueDate!.getTime();
        const eventTypes = inv.emailEvents.map((e) => e.type);

        return scoreCollectionRisk({
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          clientId: inv.client.id,
          clientName: inv.client.name,
          balance,
          daysUntilDue: Math.round((dueMs - now) / dayMs),
          clientOnTimePercent: behavior.onTimePercent,
          clientAvgDaysLate: 0, // avgDaysLate not in summary shape; score weights it only when > 0
          isReliablePayer: behavior.onTimePercent !== null && behavior.onTimePercent >= threshold,
          remindersSent: reminderDates.length,
          daysSinceLastReminder:
            lastReminder === null ? null : Math.round((now - lastReminder) / dayMs),
          invoiceOpened: eventTypes.includes("email.opened"),
          invoiceClicked: eventTypes.includes("email.clicked"),
        });
      });

      return rankCollectionsQueue(scores);
    },
    ["collections:queue", orgId],
    { tags: [collectionsTag(orgId)], revalidate: COLLECTIONS_QUEUE_TTL },
  )();

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
      assertAiRateLimit("reminderDraft", ctx.orgId);
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
        tone: z.enum(["helpful", "professional", "firm"]).optional(),
        source: z.enum(["ai", "template_fallback"]).optional(),
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

      // Record the send so the collections risk model counts it toward
      // remindersSent and holds off re-nagging for the cooldown window.
      await ctx.db.invoiceReminder.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          subject: input.subject,
          tone: input.tone,
          source: input.source,
        },
      });

      // Purge the cached queue so the next read reflects this reminder
      // (remindersSent / daysSinceLastReminder feed actionDue).
      invalidateOrg(ctx.orgId, "collections");

      return { sent: true, suppressed: false as const };
    }),

  /**
   * Ranked daily collections queue for the org, served from the per-org
   * cached scan above (60s TTL, purged on sendReminder). Read-only; every
   * query is scoped to the caller's org. Drafting/sending stay in
   * draftReminder/sendReminder — the UI calls those per row.
   *
   * Balance is computed as total − sum(payments) to match the authoritative
   * payment-amount source; partialPayments is an installment schedule, not
   * actual receipts. Invoices fully paid (balance ≤ 0) are skipped.
   *
   * clientAvgDaysLate is passed as 0 because getClientPaymentBehaviorSummary
   * does not yet return avgDaysLate; the score weights it only when > 0.
   */
  queue: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const ranked = await getRankedCollectionsQueue(ctx.db, ctx.orgId);
      return { queue: ranked.slice(0, limit) };
    }),
});
