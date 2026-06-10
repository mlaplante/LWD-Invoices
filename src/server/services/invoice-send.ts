import type { db as Db } from "../db";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { fullInvoiceInclude } from "@/server/lib/invoice-includes";
import { logAudit } from "./audit";
import { notifyOrgAdmins } from "./notifications";
import { getAppUrl } from "@/lib/app-url";

export interface DeliverInvoiceOptions {
  /** One-off CC override; when omitted the client's saved ccEmails are used. */
  cc?: string[];
  /** Acting user for the audit trail; omit for automated (cron) sends. */
  userId?: string;
}

/**
 * Full invoice-send pipeline: status flip + lastSent, email with PDF, audit
 * log, admin notification, and the invoice/sent automation event. Shared by
 * the manual `invoices.send` mutation and the scheduled-invoice-sends cron so
 * a scheduled send behaves identically to clicking "Send".
 *
 * Returns the updated invoice, or null when no invoice matches (caller
 * decides whether that's a 404 or a skipped cron row). Email failures are
 * logged but not thrown — matching the manual send, where the status change
 * sticks even if the SMTP hop hiccups.
 */
export async function deliverInvoice(
  db: typeof Db,
  invoiceId: string,
  organizationId: string,
  options: DeliverInvoiceOptions = {},
) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId, organizationId },
    include: fullInvoiceInclude,
  });
  if (!invoice) return null;

  const newStatus =
    invoice.type === InvoiceType.ESTIMATE ? invoice.status : InvoiceStatus.SENT;

  const updated = await db.invoice.update({
    where: { id: invoiceId, organizationId },
    data: {
      status: newStatus,
      lastSent: new Date(),
      // Any send (manual or cron) consumes a pending schedule.
      scheduledSendAt: null,
      scheduledSendCc: [],
    },
  });

  const appUrl = await getAppUrl();

  try {
    const { sendInvoiceSentEmail } = await import("@/server/services/invoice-sent-email");
    await sendInvoiceSentEmail(invoice, appUrl, options.cc);
  } catch (err) {
    console.error("[deliverInvoice] Failed to send invoice email:", err);
  }

  await Promise.all([
    logAudit({
      action: "SENT",
      entityType: "Invoice",
      entityId: invoice.id,
      entityLabel: invoice.number,
      organizationId: invoice.organization.id,
      userId: options.userId,
    }).catch(() => {}),
    notifyOrgAdmins(invoice.organization.id, {
      type: "INVOICE_SENT",
      title: "Invoice sent",
      body: `Invoice #${invoice.number} sent to ${invoice.client.name}`,
      link: `/invoices/${invoice.id}`,
    }).catch(() => {}),
  ]);

  // Fire automation event for invoice sent
  try {
    const { inngest: inngestClient } = await import("@/inngest/client");
    await inngestClient.send({
      name: "invoice/sent",
      data: { invoiceId: invoice.id, trigger: "INVOICE_SENT" },
    });
  } catch {
    // Non-fatal
  }

  return updated;
}
