import { inngest } from "../client";
import { db } from "@/server/db";
import { getOwnerBcc } from "@/server/services/email-bcc";

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
  { id: "process-payment-reminders", name: "Process Payment Reminders" },
  { cron: "0 8 * * *" }, // daily at 8am UTC
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
        organization: {
          select: { name: true, paymentReminderDays: true, logoUrl: true },
        },
        currency: true,
        partialPayments: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const { Resend } = await import("resend");
    const { render } = await import("@react-email/render");
    const { PaymentReminderEmail } = await import("@/emails/PaymentReminderEmail");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const results = await Promise.allSettled(
      invoices.map(async (invoice) => {
        if (!invoice.client.email) return;
        if (!invoice.dueDate) return;

        const daysUntilDue = calcDaysUntilDue(now, invoice.dueDate);

        if (!shouldSendReminder(daysUntilDue, invoice.reminderDaysOverride, invoice.organization.paymentReminderDays)) return;
        const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

        // Find the next unpaid installment
        const nextUnpaidInstallment = invoice.partialPayments.find((p) => !p.isPaid);
        const nextInstallmentInfo = nextUnpaidInstallment
          ? {
              amount: nextUnpaidInstallment.amount.toFixed(2),
              dueDate: nextUnpaidInstallment.dueDate?.toLocaleDateString() ?? invoice.dueDate.toLocaleDateString(),
              installmentNumber: invoice.partialPayments.indexOf(nextUnpaidInstallment) + 1,
              totalInstallments: invoice.partialPayments.length,
            }
          : undefined;

        const html = await render(
          PaymentReminderEmail({
            invoiceNumber: invoice.number,
            clientName: invoice.client.name,
            total: invoice.total.toFixed(2),
            currencySymbol: invoice.currency.symbol,
            dueDate: nextInstallmentInfo?.dueDate ?? invoice.dueDate.toLocaleDateString(),
            orgName: invoice.organization.name,
            portalLink,
            daysUntilDue,
            logoUrl: invoice.organization.logoUrl ?? undefined,
            nextInstallment: nextInstallmentInfo,
          }),
        );

        const bcc = await getOwnerBcc(invoice.organizationId);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: invoice.client.email,
          subject: `Payment reminder — Invoice #${invoice.number} due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`,
          html,
          ...(bcc ? { bcc } : {}),
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
