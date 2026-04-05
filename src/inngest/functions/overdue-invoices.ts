import { inngest } from "../client";
import { db } from "@/server/db";
import { notifyOrgAdmins } from "@/server/services/notifications";
import { sendEmail } from "@/server/services/email-sender";
import { getNextInstallmentInfo } from "@/server/services/partial-payments";
import { fullInvoiceInclude } from "@/server/lib/invoice-includes";

export function calcDaysOverdue(now: Date, dueDate: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
}

export const processOverdueInvoices = inngest.createFunction(
  { id: "process-overdue-invoices", name: "Process Overdue Invoices", triggers: [{ cron: "0 7 * * *" }] }, // daily at 7am UTC
  async () => {
    const now = new Date();

    // Self-healing: revert OVERDUE → PARTIALLY_PAID for installment invoices
    // whose next installment isn't due yet (fixes incorrectly marked invoices)
    const wronglyOverdue = await db.invoice.findMany({
      where: {
        status: "OVERDUE",
        type: { in: ["SIMPLE", "DETAILED"] },
        isArchived: false,
      },
      include: { partialPayments: true },
    });

    let reverted = 0;
    for (const invoice of wronglyOverdue) {
      if (invoice.partialPayments.length > 0) {
        const sorted = [...invoice.partialPayments].sort((a, b) => a.sortOrder - b.sortOrder);
        const nextUnpaid = sorted.find((pp) => !pp.isPaid);
        if (nextUnpaid?.dueDate && nextUnpaid.dueDate > now) {
          await db.invoice.update({
            where: { id: invoice.id },
            data: { status: "PARTIALLY_PAID" },
          });
          reverted++;
        }
      }
    }

    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: now },
        type: { in: ["SIMPLE", "DETAILED"] },
        isArchived: false,
      },
      include: fullInvoiceInclude,
    });

    const results = await Promise.allSettled(
      invoices.map(async (invoice) => {
        // For partially paid invoices with installments, check the next
        // unpaid installment's due date — not the top-level invoice due date.
        if (invoice.status === "PARTIALLY_PAID" && invoice.partialPayments.length > 0) {
          const sorted = [...invoice.partialPayments].sort((a, b) => a.sortOrder - b.sortOrder);
          const nextUnpaid = sorted.find((pp) => !pp.isPaid);
          if (nextUnpaid?.dueDate && nextUnpaid.dueDate > now) {
            return; // next installment not yet due, skip
          }
        }

        await db.invoice.update({
          where: { id: invoice.id },
          data: { status: "OVERDUE" },
        });

        const daysOverdue = calcDaysOverdue(now, invoice.dueDate!);
        const portalLink = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${invoice.portalToken}`;

        // Send overdue email — non-fatal
        if (invoice.client.email) {
          try {
            const { render } = await import("@react-email/render");
            const { OverdueEmail } = await import("@/emails/OverdueEmail");

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

            await sendEmail({
              organizationId: invoice.organizationId,
              to: invoice.client.email,
              subject: `OVERDUE — Invoice #${invoice.number} is ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} past due`,
              html,
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
      reverted,
      processed: invoices.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },
);
