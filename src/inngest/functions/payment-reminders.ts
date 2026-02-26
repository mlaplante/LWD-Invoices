import { inngest } from "../client";
import { db } from "@/server/db";

export function calcDaysUntilDue(now: Date, dueDate: Date): number {
  return Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
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
          select: { name: true, paymentReminderDays: true },
        },
        currency: true,
      },
    });

    const results = await Promise.allSettled(
      invoices.map(async (invoice) => {
        if (!invoice.client.email) return;

        const daysUntilDue = calcDaysUntilDue(now, invoice.dueDate!);

        if (!shouldSendReminder(daysUntilDue, invoice.reminderDaysOverride, invoice.organization.paymentReminderDays)) return;
        const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

        const { Resend } = await import("resend");
        const { render } = await import("@react-email/render");
        const { PaymentReminderEmail } = await import("@/emails/PaymentReminderEmail");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = await render(
          PaymentReminderEmail({
            invoiceNumber: invoice.number,
            clientName: invoice.client.name,
            total: invoice.total.toFixed(2),
            currencySymbol: invoice.currency.symbol,
            dueDate: invoice.dueDate!.toLocaleDateString(),
            orgName: invoice.organization.name,
            portalLink,
            daysUntilDue,
          }),
        );

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
          to: invoice.client.email,
          subject: `Payment reminder — Invoice #${invoice.number} due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`,
          html,
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
