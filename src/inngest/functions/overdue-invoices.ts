import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { getOwnerBcc } from "@/server/services/email-bcc";
import { getNextInstallmentInfo } from "@/server/services/partial-payments";

export function calcDaysOverdue(now: Date, dueDate: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
}

export const processOverdueInvoices = inngest.createFunction(
  { id: "process-overdue-invoices", name: "Process Overdue Invoices", triggers: [{ cron: "0 7 * * *" }] }, // daily at 7am UTC
  async () => {
    const now = new Date();

    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: now },
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

    const results = await Promise.allSettled(
      invoices.map(async (invoice) => {
        await db.invoice.update({
          where: { id: invoice.id },
          data: { status: "OVERDUE" },
        });

        const daysOverdue = calcDaysOverdue(now, invoice.dueDate!);
        const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

        // Send overdue email — non-fatal
        if (invoice.client.email) {
          try {
            const { Resend } = await import("resend");
            const { render } = await import("@react-email/render");
            const { OverdueEmail } = await import("@/emails/OverdueEmail");
            const resend = new Resend(process.env.RESEND_API_KEY);

            // Find next unpaid installment for split payment invoices
            const nextInstallment = getNextInstallmentInfo(invoice.partialPayments ?? [], invoice.total);

            const html = await render(
              OverdueEmail({
                invoiceNumber: invoice.number,
                clientName: invoice.client.name,
                total: invoice.total.toFixed(2),
                currencySymbol: invoice.currency.symbol,
                dueDate: invoice.dueDate!.toLocaleDateString(),
                daysOverdue,
                orgName: invoice.organization.name,
                portalLink,
                logoUrl: invoice.organization.logoUrl ?? undefined,
                nextInstallment,
              }),
            );

            const { generateInvoicePDF } = await import("@/server/services/invoice-pdf");
            const pdfBuffer = await generateInvoicePDF(invoice);

            const bcc = await getOwnerBcc(invoice.organizationId);
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
              to: invoice.client.email,
              subject: `OVERDUE — Invoice #${invoice.number} is ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} past due`,
              html,
              ...(bcc ? { bcc } : {}),
              attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuffer }],
            });
          } catch {
            // Email failure is non-fatal
          }
        }

        // In-app notification for org admins
        await notifyOrgAdmins(invoice.organizationId, {
          type: "INVOICE_OVERDUE",
          title: `Invoice #${invoice.number} is overdue`,
          body: `${invoice.client.name}'s invoice is ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} overdue`,
          link: `/invoices/${invoice.id}`,
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
