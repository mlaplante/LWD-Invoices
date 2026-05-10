import "server-only";
import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma";

/**
 * Promotes a Stripe Tax Calculation to a Tax Transaction. Required for the
 * tax to appear in Stripe's Tax filing reports — Calculations are previews
 * and don't contribute to remittance until promoted.
 *
 * Idempotent: if the invoice already has stripeTaxTransactionId set, returns
 * early. Safe to call from a webhook handler that may retry.
 *
 * Failures are intentionally non-fatal to the caller: the payment has
 * already been recorded, and a missed Tax Transaction can be reconciled
 * out-of-band. We log via the audit hook the caller passes in.
 */
export async function promoteStripeTaxCalculation(opts: {
  db: PrismaClient;
  stripe: Stripe;
  invoiceId: string;
  // The reference is what Stripe shows in Tax reports — typically the
  // invoice number so it's identifiable to the operator.
  reference: string;
}): Promise<{ transactionId: string | null; reason?: string }> {
  const invoice = await opts.db.invoice.findUnique({
    where: { id: opts.invoiceId },
    select: { stripeTaxCalculationId: true, stripeTaxTransactionId: true },
  });
  if (!invoice) return { transactionId: null, reason: "invoice not found" };
  if (invoice.stripeTaxTransactionId) {
    return { transactionId: invoice.stripeTaxTransactionId, reason: "already promoted" };
  }
  if (!invoice.stripeTaxCalculationId) {
    return { transactionId: null, reason: "no calculation to promote" };
  }

  try {
    const transaction = await opts.stripe.tax.transactions.createFromCalculation({
      calculation: invoice.stripeTaxCalculationId,
      reference: opts.reference,
    });

    await opts.db.invoice.update({
      where: { id: opts.invoiceId },
      data: { stripeTaxTransactionId: transaction.id },
    });

    return { transactionId: transaction.id };
  } catch (err) {
    // Calculations expire after 90 days. If the invoice was created long ago
    // and only paid now, we surface the reason but don't break the webhook.
    const reason =
      err instanceof Error
        ? err.message
        : "unknown error promoting Stripe Tax calculation";
    return { transactionId: null, reason };
  }
}
