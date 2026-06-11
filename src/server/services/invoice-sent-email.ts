import { sendEmail } from "./email-sender";
import { sanitizeCcList } from "./cc-emails";
import { resolvePartialPaymentAmount } from "./partial-payments";
import { formatDate } from "@/lib/format";
import { resolveEarlyPayOffer } from "./early-payment-discount";
import type { FullInvoice } from "./invoice-pdf";

/**
 * Renders and sends an InvoiceSentEmail with PDF attachment.
 * Used by both send and sendMany mutations.
 *
 * `ccOverride` lets the send dialog supply a one-off CC list — when provided,
 * it replaces (not extends) the client's saved ccEmails for this send only.
 */
export async function sendInvoiceSentEmail(
  invoice: FullInvoice,
  appUrl: string,
  ccOverride?: string[]
): Promise<void> {
  if (!invoice.client.email) return;

  const { render } = await import("@react-email/render");
  const { InvoiceSentEmail } = await import("@/emails/InvoiceSentEmail");

  const partialPayments = invoice.partialPayments
    ?.sort((a, b) => a.sortOrder - b.sortOrder)
    .map((pp) => ({
      amount: resolvePartialPaymentAmount(pp, invoice.total).toFixed(2),
      dueDate: pp.dueDate ? formatDate(pp.dueDate) : null,
      isPaid: pp.isPaid,
    }));

  // Surface the early-pay offer in the email so the client sees it without
  // opening the portal. Status is checked as SENT-equivalent: this helper only
  // runs from the send path, so evaluate the offer as if already sent.
  const offer = resolveEarlyPayOffer({
    percent: invoice.earlyPayDiscountPercent?.toNumber(),
    days: invoice.earlyPayDiscountDays,
    invoiceDate: invoice.date,
    status: "SENT",
    total: invoice.total.toNumber(),
    paidSoFar: 0,
    hasInstallments: (invoice.partialPayments ?? []).some((pp) => !pp.isPaid),
    redeemedAt: invoice.earlyPayDiscountRedeemedAt,
    now: new Date(),
  });

  const html = await render(
    InvoiceSentEmail({
      invoiceNumber: invoice.number,
      clientName: invoice.client.name,
      total: invoice.total.toNumber().toFixed(2),
      currencySymbol: invoice.currency.symbol,
      dueDate: invoice.dueDate ? formatDate(invoice.dueDate) : null,
      orgName: invoice.organization.name,
      portalLink: `${appUrl}/portal/${invoice.portalToken}`,
      payLink: `${appUrl}/pay/${invoice.portalToken}`,
      logoUrl: invoice.organization.logoUrl ?? undefined,
      partialPayments: partialPayments && partialPayments.length > 0 ? partialPayments : undefined,
      earlyPayOffer: offer
        ? {
            percent: offer.percent,
            deadline: formatDate(offer.deadline),
            discountedTotal: offer.discountedBalance.toFixed(2),
          }
        : undefined,
    })
  );

  const { getOrRenderInvoicePDF } = await import("@/server/services/invoice-pdf-cache");
  const pdfBuffer = await getOrRenderInvoicePDF(invoice);

  const ccSource = ccOverride ?? invoice.client.ccEmails ?? [];
  const cc = sanitizeCcList(ccSource, invoice.client.email);

  await sendEmail({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    to: invoice.client.email,
    cc: cc.length > 0 ? cc : undefined,
    subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
    html,
    attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuffer }],
  });
}
