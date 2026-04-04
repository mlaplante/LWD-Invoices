import { inngest } from "../client";
import { db } from "@/server/db";
import { sendEmail } from "@/server/services/email-sender";
import { getNextInstallmentInfo, getEffectiveDueDate } from "@/server/services/partial-payments";

export function calcDaysUntilDue(now: Date, dueDate: Date): number {
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueMidnight = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  return Math.round((dueMidnight - nowMidnight) / 86400000);
}

export function getQueryWindow(now: Date): { from: Date; to: Date } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() + 1);
  from.setUTCHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 90);
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

export function shouldSendReminder(daysUntilDue: number, override: number[], orgDays: number[]): boolean {
  return (override.length > 0 ? override : orgDays).includes(daysUntilDue);
}

export const processPaymentReminders = inngest.createFunction(
  { id: "process-payment-reminders", name: "Process Payment Reminders", triggers: [{ cron: "0 8 * * *" }] }, // daily at 8am UTC
  async () => {
    const now = new Date();
    const { from, to } = getQueryWindow(now);

    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { gte: from, lte: to },
        type: { in: ["SIMPLE", "DETAILED"] },
        isArchived: false,
      },
      include: {
        client: true,
        organization: true,
        currency: true,
        partialPayments: true,
        lines: { include: { taxes: { include: { tax: true } } }, orderBy: { sort: "asc" } },
        payments: { orderBy: { paidAt: "asc" } },
        lateFeeEntries: { orderBy: { createdAt: "asc" } },
      },
    });

    const { render } = await import("@react-email/render");
    const { PaymentReminderEmail } = await import("@/emails/PaymentReminderEmail");

    const results = await Promise.allSettled(
      invoices.map(async (invoice) => {
        if (!invoice.client.email) return;
        if (!invoice.dueDate) return;

        // For installment invoices, use the next unpaid installment's due date
        const effectiveDueDate = invoice.status === "PARTIALLY_PAID"
          ? getEffectiveDueDate(invoice.partialPayments ?? [], invoice.dueDate)
          : invoice.dueDate;

        const daysUntilDue = calcDaysUntilDue(now, effectiveDueDate);

        if (!shouldSendReminder(daysUntilDue, invoice.reminderDaysOverride, invoice.organization.paymentReminderDays)) return;
        const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

        // Find next unpaid installment for split payment invoices
        const nextInstallment = getNextInstallmentInfo(invoice.partialPayments ?? [], invoice.total);

        const html = await render(
          PaymentReminderEmail({
            invoiceNumber: invoice.number,
            clientName: invoice.client.name,
            total: invoice.total.toFixed(2),
            currencySymbol: invoice.currency.symbol,
            dueDate: invoice.dueDate.toLocaleDateString(),
            orgName: invoice.organization.name,
            portalLink,
            daysUntilDue,
            logoUrl: invoice.organization.logoUrl ?? undefined,
            nextInstallment,
          }),
        );

        const { generateInvoicePDF } = await import("@/server/services/invoice-pdf");
        const pdfBuffer = await generateInvoicePDF(invoice);

        await sendEmail({
          organizationId: invoice.organizationId,
          to: invoice.client.email,
          subject: `Payment reminder — Invoice #${invoice.number} due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`,
          html,
          attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuffer }],
        });
      }),
    );

    return {
      processed: invoices.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);
