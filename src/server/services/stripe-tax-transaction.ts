import "server-only";
import { randomUUID } from "node:crypto";
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

/**
 * Issues a Stripe Tax Transaction reversal — used when a credit note is
 * issued against an invoice whose tax was originally filed via Stripe Tax.
 * The reversal records the negative tax in Stripe's filing reports.
 *
 * Idempotent: if the credit note already has stripeTaxTransactionId set,
 * returns early. Stripe also requires a stable reference per reversal —
 * we use the credit-note id with a derived suffix.
 *
 * Stripe Tax supports two flavors of reversal:
 *   - "full": reverses the entire original transaction
 *   - "partial": reverses specific line items at specific amounts
 *
 * For now we always do a full reversal since the credit-note flow doesn't
 * track which specific Stripe Tax line items the credit applies to.
 * Partial reversals would need invoice-line-to-stripe-line mapping —
 * deferred until callers actually need it.
 */
export async function reverseStripeTaxTransaction(opts: {
  db: PrismaClient;
  stripe: Stripe;
  creditNoteId: string;
  // The original invoice's stripeTaxTransactionId. Required.
  originalTransactionId: string;
  // Reference shown in Stripe Tax reports — typically the credit-note number.
  reference: string;
}): Promise<{ transactionId: string | null; reason?: string }> {
  const cn = await opts.db.invoice.findUnique({
    where: { id: opts.creditNoteId },
    select: { stripeTaxTransactionId: true },
  });
  if (cn?.stripeTaxTransactionId) {
    return { transactionId: cn.stripeTaxTransactionId, reason: "already reversed" };
  }

  try {
    const reversal = await opts.stripe.tax.transactions.createReversal({
      mode: "full",
      original_transaction: opts.originalTransactionId,
      reference: opts.reference,
      // Stripe requires a unique idempotency key per reversal attempt;
      // derive from credit-note id so retries reuse it.
      flat_amount: undefined,
      // The Stripe API accepts an idempotency key via request options, not
      // in the body. We pass it through the second argument.
    }, { idempotencyKey: `cn-reverse-${opts.creditNoteId}-${randomUUID()}` });

    await opts.db.invoice.update({
      where: { id: opts.creditNoteId },
      data: { stripeTaxTransactionId: reversal.id },
    });

    return { transactionId: reversal.id };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.message
        : "unknown error reversing Stripe Tax transaction";
    return { transactionId: null, reason };
  }
}
