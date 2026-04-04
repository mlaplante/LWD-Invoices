import { sendEmail } from "./email-sender";
import type { FullInvoice } from "./invoice-pdf";

/**
 * Renders and sends an InvoiceSentEmail with PDF attachment.
 * Used by both send and sendMany mutations.
 */
export async function sendInvoiceSentEmail(invoice: FullInvoice, appUrl: string): Promise<void> {
  if (!invoice.client.email) return;

  const { render } = await import("@react-email/render");
  const { InvoiceSentEmail } = await import("@/emails/InvoiceSentEmail");

  const partialPayments = invoice.partialPayments
    ?.sort((a, b) => a.sortOrder - b.sortOrder)
    .map((pp) => {
      const amount = pp.isPercentage
        ? ((pp.amount.toNumber() / 100) * invoice.total.toNumber()).toFixed(2)
        : pp.amount.toNumber().toFixed(2);
      return {
        amount,
        dueDate: pp.dueDate?.toLocaleDateString() ?? null,
        isPaid: pp.isPaid,
      };
    });

  const html = await render(
    InvoiceSentEmail({
      invoiceNumber: invoice.number,
      clientName: invoice.client.name,
      total: invoice.total.toNumber().toFixed(2),
      currencySymbol: invoice.currency.symbol,
      dueDate: invoice.dueDate?.toLocaleDateString() ?? null,
      orgName: invoice.organization.name,
      portalLink: `${appUrl}/portal/${invoice.portalToken}`,
      logoUrl: invoice.organization.logoUrl ?? undefined,
      partialPayments: partialPayments && partialPayments.length > 0 ? partialPayments : undefined,
    })
  );

  const { generateInvoicePDF } = await import("@/server/services/invoice-pdf");
  const pdfBuffer = await generateInvoicePDF(invoice);

  await sendEmail({
    organizationId: invoice.organizationId,
    to: invoice.client.email,
    subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
    html,
    attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuffer }],
  });
}
