import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";
import type { EmailAutomationTrigger } from "@/generated/prisma";

/**
 * Determines whether enough time has passed since the trigger date
 * for the automation's delay to be satisfied.
 */
export function shouldSendAutomation(
  triggerDate: Date,
  delayDays: number,
  now: Date,
): boolean {
  const delayMs = delayDays * 86400000;
  return now.getTime() >= triggerDate.getTime() + delayMs;
}

/**
 * Returns the relevant trigger date for an invoice given the automation trigger type.
 * Returns null if the invoice does not qualify for this trigger.
 */
export function getEligibleInvoicesForTrigger(
  trigger: EmailAutomationTrigger,
  invoice: {
    lastSent?: Date | null;
    lastViewed?: Date | null;
    dueDate?: Date | null;
    status: string;
    payments?: { paidAt: Date }[];
  },
): Date | null {
  switch (trigger) {
    case "PAYMENT_RECEIVED": {
      if (!invoice.payments?.length) return null;
      // Use the most recent payment date
      const sorted = [...invoice.payments].sort(
        (a, b) => b.paidAt.getTime() - a.paidAt.getTime(),
      );
      return sorted[0]!.paidAt;
    }
    case "INVOICE_SENT":
      return invoice.lastSent ?? null;
    case "INVOICE_VIEWED":
      return invoice.lastViewed ?? null;
    case "INVOICE_OVERDUE": {
      if (!invoice.dueDate) return null;
      // Only qualifies if status is OVERDUE
      if (invoice.status !== "OVERDUE") return null;
      return invoice.dueDate;
    }
    default:
      return null;
  }
}

export const processEmailAutomations = inngest.createFunction(
  { id: "process-email-automations", name: "Process Email Automations" },
  { cron: "0 9 * * *" }, // daily at 9am UTC
  async () => {
    const now = new Date();

    // 1. Fetch all enabled automations
    const automations = await db.emailAutomation.findMany({
      where: { enabled: true },
    });

    if (!automations.length) {
      return { processed: 0, sent: 0, skipped: 0, failed: 0 };
    }

    // 2. Get unique org IDs
    const orgIds = [...new Set(automations.map((a) => a.organizationId))];

    // 3. Fetch non-archived invoices for those orgs with client + org data
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: { in: orgIds },
        isArchived: false,
      },
      include: {
        client: true,
        organization: true,
        currency: true,
        payments: { select: { paidAt: true, amount: true } },
      },
    });

    // 4. Fetch existing logs to prevent double-sends
    const automationIds = automations.map((a) => a.id);
    const existingLogs = await db.emailAutomationLog.findMany({
      where: { automationId: { in: automationIds } },
      select: { automationId: true, invoiceId: true },
    });
    const sentSet = new Set(
      existingLogs.map((l) => `${l.automationId}:${l.invoiceId}`),
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // 5. Process each automation + invoice combo
    for (const automation of automations) {
      const orgInvoices = invoices.filter(
        (inv) => inv.organizationId === automation.organizationId,
      );

      for (const invoice of orgInvoices) {
        const key = `${automation.id}:${invoice.id}`;
        if (sentSet.has(key)) {
          skipped++;
          continue;
        }

        const triggerDate = getEligibleInvoicesForTrigger(automation.trigger, {
          lastSent: invoice.lastSent,
          lastViewed: invoice.lastViewed,
          dueDate: invoice.dueDate,
          status: invoice.status,
          payments: invoice.payments.map((p) => ({
            paidAt: p.paidAt,
          })),
        });

        if (!triggerDate) {
          skipped++;
          continue;
        }

        if (!shouldSendAutomation(triggerDate, automation.delayDays, now)) {
          skipped++;
          continue;
        }

        if (!invoice.client.email) {
          skipped++;
          continue;
        }

        // Build template variables
        const lastPayment = invoice.payments.length
          ? invoice.payments.sort(
              (a, b) => b.paidAt.getTime() - a.paidAt.getTime(),
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

        const subject = interpolateTemplate(
          automation.templateSubject,
          vars,
        );
        const body = interpolateTemplate(automation.templateBody, vars);

        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);

          const bcc = await getOwnerBcc(invoice.organizationId);
          await resend.emails.send({
            from:
              process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
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
    }

    return { processed: automations.length, sent, skipped, failed };
  },
);
