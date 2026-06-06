import { db } from "@/server/db";
import { sendEmail } from "./email-sender";
import { sanitizeCcList } from "./cc-emails";
import { formatDate } from "@/lib/format";

/**
 * Sends a payment receipt email to the client with BCC to the org owner.
 * Used by both the Stripe webhook and manual payment flows.
 *
 * `ccOverride` lets the send-receipt dialog supply a one-off CC list — when
 * provided, it replaces the client's saved ccEmails for this send only.
 */
export async function sendPaymentReceiptEmail({
  invoiceId,
  amountPaid,
  organizationId,
  partialPaymentId,
  ccOverride,
}: {
  invoiceId: string;
  amountPaid: number;
  organizationId: string;
  partialPaymentId?: string;
  ccOverride?: string[];
}) {
  const fullInvoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, organization: true, currency: true, partialPayments: true },
  });

  if (!fullInvoice?.client.email) return;

  const { render } = await import("@react-email/render");
  const { PaymentReceiptEmail } = await import("@/emails/PaymentReceiptEmail");

  // Calculate installment info if partial payments exist
  let installmentNumber: number | undefined;
  let totalInstallments: number | undefined;
  let remainingBalance: string | undefined;

  if (fullInvoice.partialPayments && fullInvoice.partialPayments.length > 0) {
    const sortedPayments = fullInvoice.partialPayments.sort((a, b) => a.sortOrder - b.sortOrder);
    totalInstallments = sortedPayments.length;

    if (partialPaymentId) {
      const paidInstallmentIndex = sortedPayments.findIndex(pp => pp.id === partialPaymentId);
      if (paidInstallmentIndex !== -1) {
        installmentNumber = paidInstallmentIndex + 1;
      }
    }

    const totalInvoiceAmount = fullInvoice.total.toNumber();
    const totalPaid = sortedPayments
      .filter(pp => pp.isPaid)
      .reduce((sum, pp) => {
        const amount = pp.isPercentage
          ? (pp.amount.toNumber() / 100) * totalInvoiceAmount
          : pp.amount.toNumber();
        return sum + amount;
      }, 0);

    const remaining = totalInvoiceAmount - totalPaid;
    if (remaining > 0.01) {
      remainingBalance = remaining.toFixed(2);
    }
  }

  const html = await render(
    PaymentReceiptEmail({
      invoiceNumber: fullInvoice.number,
      clientName: fullInvoice.client.name,
      amountPaid: amountPaid.toFixed(2),
      currencySymbol: fullInvoice.currency.symbol,
      orgName: fullInvoice.organization.name,
      paidAt: formatDate(new Date()),
      portalLink: fullInvoice.portalToken
        ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${fullInvoice.portalToken}`
        : undefined,
      payLink: fullInvoice.portalToken
        ? `${process.env.NEXT_PUBLIC_APP_URL}/pay/${fullInvoice.portalToken}`
        : undefined,
      logoUrl: fullInvoice.organization.logoUrl ?? undefined,
      installmentNumber,
      totalInstallments,
      remainingBalance,
    })
  );

  const ccSource = ccOverride ?? fullInvoice.client.ccEmails ?? [];
  const cc = sanitizeCcList(ccSource, fullInvoice.client.email);

  await sendEmail({
    organizationId,
    invoiceId: fullInvoice.id,
    to: fullInvoice.client.email,
    cc: cc.length > 0 ? cc : undefined,
    subject: `Payment received — Invoice #${fullInvoice.number}`,
    html,
  });
}
