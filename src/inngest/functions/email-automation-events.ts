import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";
import type { EmailAutomationTrigger } from "@/generated/prisma";

/**
 * Maps Inngest event names to automation trigger types.
 */
const EVENT_TO_TRIGGER: Record<string, EmailAutomationTrigger> = {
  "invoice/payment.received": "PAYMENT_RECEIVED",
  "invoice/sent": "INVOICE_SENT",
  "invoice/viewed": "INVOICE_VIEWED",
};

/**
 * Handles immediate (delayDays=0) automations in response to real-time events.
 * Delayed automations are still handled by the daily cron job.
 */
export const handleAutomationEvent = inngest.createFunction(
  {
    id: "handle-automation-event",
    name: "Handle Automation Event",
  },
  [
    { event: "invoice/payment.received" },
    { event: "invoice/sent" },
    { event: "invoice/viewed" },
  ],
  async ({ event }) => {
    const { invoiceId } = event.data as { invoiceId: string; trigger: string };
    const trigger = EVENT_TO_TRIGGER[event.name];
    if (!trigger) {
      return { sent: 0, reason: "unknown_event" };
    }

    // Fetch the invoice with all needed relations
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        organization: true,
        currency: true,
        payments: { select: { paidAt: true, amount: true } },
      },
    });

    if (!invoice || !invoice.client.email) {
      return { sent: 0, reason: "no_invoice_or_email" };
    }

    // Find enabled immediate automations for this org + trigger
    const automations = await db.emailAutomation.findMany({
      where: {
        organizationId: invoice.organizationId,
        trigger,
        enabled: true,
        delayDays: 0,
      },
    });

    if (!automations.length) {
      return { sent: 0, reason: "no_matching_automations" };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const automation of automations) {
      // Check for existing log (double-send prevention)
      const existingLog = await db.emailAutomationLog.findFirst({
        where: {
          automationId: automation.id,
          invoiceId: invoice.id,
        },
      });

      if (existingLog) {
        skipped++;
        continue;
      }

      // Build template variables
      const lastPayment = invoice.payments.length
        ? [...invoice.payments].sort(
            (a, b) => b.paidAt.getTime() - a.paidAt.getTime()
          )[0]
        : null;

      const vars = buildTemplateVariables({
        clientName: invoice.client.name,
        invoiceNumber: invoice.number,
        amountDue: invoice.total.toFixed(2),
        dueDate: invoice.dueDate?.toLocaleDateString() ?? "",
        portalToken: invoice.portalToken,
        orgName: invoice.organization.name,
        amountPaid: lastPayment?.amount?.toFixed(2) ?? "",
        paymentDate: lastPayment?.paidAt?.toLocaleDateString() ?? "",
      });

      const subject = interpolateTemplate(automation.templateSubject, vars);
      const body = interpolateTemplate(automation.templateBody, vars);

      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const bcc = await getOwnerBcc(invoice.organizationId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: invoice.client.email,
          subject,
          html: body,
          ...(bcc ? { bcc } : {}),
        });

        await db.emailAutomationLog.create({
          data: {
            automationId: automation.id,
            invoiceId: invoice.id,
            recipientEmail: invoice.client.email,
          },
        });

        sent++;
      } catch {
        failed++;
      }
    }

    return { sent, skipped, failed };
  }
);
