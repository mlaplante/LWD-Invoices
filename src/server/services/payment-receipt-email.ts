import { db } from "@/server/db";
import { getOwnerBcc } from "./email-bcc";

/**
 * Sends a payment receipt email to the client with BCC to the org owner.
 * Used by both the Stripe webhook and manual payment flows.
 */
export async function sendPaymentReceiptEmail({
  invoiceId,
  amountPaid,
  organizationId,
  partialPaymentId,
}: {
  invoiceId: string;
  amountPaid: number;
  organizationId: string;
  partialPaymentId?: string;
}) {
  const fullInvoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, organization: true, currency: true, partialPayments: true },
  });

  if (!fullInvoice?.client.email) return;

  const { Resend } = await import("resend");
  const { render } = await import("@react-email/render");
  const { PaymentReceiptEmail } = await import("@/emails/PaymentReceiptEmail");
  const resend = new Resend(process.env.RESEND_API_KEY);

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
      paidAt: new Date().toLocaleDateString(),
      portalLink: fullInvoice.portalToken
        ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/${fullInvoice.portalToken}`
        : undefined,
      logoUrl: fullInvoice.organization.logoUrl ?? undefined,
      installmentNumber,
      totalInstallments,
      remainingBalance,
    })
  );

  const bcc = await getOwnerBcc(organizationId);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "invoices@example.com",
    to: fullInvoice.client.email,
    subject: `Payment received — Invoice #${fullInvoice.number}`,
    html,
    ...(bcc ? { bcc } : {}),
  });
}
