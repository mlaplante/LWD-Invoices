import { inngest } from "../client";
import { db } from "@/server/db";
import { deliverInvoice } from "@/server/services/invoice-send";

/**
 * Delivers invoices whose scheduledSendAt has arrived. Users schedule a send
 * from the invoice dialog (usually at the client's best-send-window
 * recommendation); this cron is what actually emails it.
 *
 * Each invoice is claimed by atomically nulling scheduledSendAt before
 * sending, so overlapping cron runs can't double-send. deliverInvoice runs
 * the same pipeline as a manual send (status flip, email + PDF, audit,
 * notification, automation event).
 */
export const processScheduledInvoiceSends = inngest.createFunction(
  {
    id: "process-scheduled-invoice-sends",
    name: "Process Scheduled Invoice Sends",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async () => {
    const now = new Date();

    const due = await db.invoice.findMany({
      where: {
        scheduledSendAt: { lte: now },
        isArchived: false,
      },
      select: { id: true, organizationId: true, scheduledSendCc: true },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const invoice of due) {
      // Atomic claim: only one run wins the row even if crons overlap.
      const claimed = await db.invoice.updateMany({
        where: { id: invoice.id, scheduledSendAt: { lte: now } },
        data: { scheduledSendAt: null },
      });
      if (claimed.count === 0) {
        skipped++;
        continue;
      }

      try {
        await deliverInvoice(db, invoice.id, invoice.organizationId, {
          cc: invoice.scheduledSendCc.length > 0 ? invoice.scheduledSendCc : undefined,
        });
        sent++;
      } catch (err) {
        failed++;
        console.error(
          `[scheduled-invoice-sends] Failed to send invoice ${invoice.id}:`,
          err,
        );
      }
    }

    return { due: due.length, sent, skipped, failed };
  },
);
