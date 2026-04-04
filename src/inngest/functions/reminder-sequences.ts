import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "@/server/services/automation-template";
import { isReliablePayer } from "@/server/services/client-payment-score";
import { getEffectiveDueDate } from "@/server/services/partial-payments";

/**
 * Determines which step fires today for a given invoice.
 * Returns null if no step is due or all matching steps have been sent.
 */
export function getStepDueToday(
  now: Date,
  dueDate: Date,
  steps: { id: string; daysRelativeToDue: number }[],
  sentStepIds: Set<string>
): { id: string; daysRelativeToDue: number } | null {
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysFromDue = Math.round((nowMidnight - dueMidnight) / 86400000);

  for (const step of steps) {
    if (step.daysRelativeToDue === daysFromDue && !sentStepIds.has(step.id)) {
      return step;
    }
  }
  return null;
}

export const processReminderSequences = inngest.createFunction(
  { id: "process-reminder-sequences", name: "Process Reminder Sequences", triggers: [{ cron: "0 8 * * *" }] }, // daily at 8am UTC
  async () => {
    const now = new Date();

    // 1. Fetch all enabled sequences with their steps
    const sequences = await db.reminderSequence.findMany({
      where: { enabled: true },
      include: { steps: { orderBy: { sort: "asc" } } },
    });

    if (!sequences.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    // Build lookup: orgId -> sequences
    const orgSequences = new Map<string, typeof sequences>();
    for (const seq of sequences) {
      const list = orgSequences.get(seq.organizationId) ?? [];
      list.push(seq);
      orgSequences.set(seq.organizationId, list);
    }

    // 2. Fetch unpaid invoices with due dates for these orgs
    const orgIds = [...orgSequences.keys()];

    // Pre-fetch smart reminder settings for all orgs
    const orgSettings = await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, smartRemindersEnabled: true, smartRemindersThreshold: true },
    });
    const orgSettingsMap = new Map(orgSettings.map((o) => [o.id, o]));
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: { in: orgIds },
        isArchived: false,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { not: null },
        type: { in: ["SIMPLE", "DETAILED"] },
      },
      include: {
        client: true,
        organization: { select: { name: true } },
        currency: true,
        partialPayments: true,
      },
    });

    // 3. Fetch existing reminder logs for these invoices
    const invoiceIds = invoices.map((i) => i.id);
    const allStepIds = sequences.flatMap((s) => s.steps.map((st) => st.id));
    const existingLogs = await db.reminderLog.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        stepId: { in: allStepIds },
      },
      select: { stepId: true, invoiceId: true },
    });

    // Build lookup: invoiceId -> Set<stepId>
    const sentMap = new Map<string, Set<string>>();
    for (const log of existingLogs) {
      const set = sentMap.get(log.invoiceId) ?? new Set();
      set.add(log.stepId);
      sentMap.set(log.invoiceId, set);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // 4. Process each invoice
    for (const invoice of invoices) {
      if (!invoice.dueDate || !invoice.client.email) {
        skipped++;
        continue;
      }

      // Determine which sequence applies:
      // 1. Invoice-level override (reminderSequenceId)
      // 2. Org default sequence (isDefault)
      const orgSeqs = orgSequences.get(invoice.organizationId) ?? [];
      const sequence = invoice.reminderSequenceId
        ? orgSeqs.find((s) => s.id === invoice.reminderSequenceId)
        : orgSeqs.find((s) => s.isDefault);

      if (!sequence) {
        skipped++;
        continue;
      }

      // For installment invoices, anchor step schedule to next unpaid installment's due date
      const effectiveDueDate = invoice.status === "PARTIALLY_PAID"
        ? getEffectiveDueDate(invoice.partialPayments ?? [], invoice.dueDate)
        : invoice.dueDate;

      const sentStepIds = sentMap.get(invoice.id) ?? new Set();
      const step = getStepDueToday(now, effectiveDueDate, sequence.steps, sentStepIds);

      if (!step) {
        skipped++;
        continue;
      }

      // Retrieve the full step data
      const fullStep = sequence.steps.find((s) => s.id === step.id);
      if (!fullStep) {
        skipped++;
        continue;
      }

      // Smart reminders: skip pre-due steps for reliable clients
      if (fullStep.daysRelativeToDue < 0) {
        const orgSetting = orgSettingsMap.get(invoice.organizationId);
        if (orgSetting?.smartRemindersEnabled) {
          const reliable = await isReliablePayer(db, invoice.clientId, orgSetting.smartRemindersThreshold);
          if (reliable) {
            await db.reminderLog.create({
              data: { stepId: fullStep.id, invoiceId: invoice.id },
            });
            skipped++;
            continue;
          }
        }
      }

      try {
        // Build template variables
        const vars = buildTemplateVariables({
          clientName: invoice.client.name,
          invoiceNumber: invoice.number,
          amountDue: Number(invoice.total).toFixed(2),
          dueDate: invoice.dueDate.toLocaleDateString(),
          portalToken: invoice.portalToken,
          orgName: invoice.organization.name,
        });

        const subject = interpolateTemplate(fullStep.subject, vars);
        const body = interpolateTemplate(fullStep.body, vars);

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const bcc = await getOwnerBcc(invoice.organizationId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "reminders@example.com",
          to: invoice.client.email,
          subject,
          html: body,
          ...(bcc ? { bcc } : {}),
        });

        // Log the send to prevent double-sends
        await db.reminderLog.create({
          data: {
            stepId: fullStep.id,
            invoiceId: invoice.id,
          },
        });

        sent++;
      } catch (err) {
        console.error(`[reminder-sequences] Failed to send for invoice ${invoice.number}:`, err);
        failed++;
      }
    }

    return { processed: invoices.length, sent, skipped, failed };
  }
);
