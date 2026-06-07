import type { NextInstallmentInfo } from "@/emails/types";
import type { Prisma } from "@/generated/prisma";

type PartialPaymentRecord = {
  sortOrder: number;
  amount: Prisma.Decimal;
  isPercentage: boolean;
  dueDate: Date | null;
  isPaid: boolean;
};

/**
 * Resolve a single installment to its concrete currency amount.
 *
 * An installment's `amount` is either a flat figure or a percentage of the
 * invoice total, switched by `isPercentage`. This one-liner was previously
 * copy-pasted across six call sites (invoice/receipt emails, the portal pay
 * flow, autopay, PDF rendering); a divergence in any copy would make a
 * customer's quoted installment disagree with what we actually charge. Keep
 * this the single source of truth and call `.toFixed(2)` at display sites.
 */
export function resolvePartialPaymentAmount(
  partial: { amount: Prisma.Decimal; isPercentage: boolean },
  invoiceTotal: Prisma.Decimal,
): number {
  return partial.isPercentage
    ? (partial.amount.toNumber() / 100) * invoiceTotal.toNumber()
    : partial.amount.toNumber();
}

/**
 * Returns the effective due date for an invoice with installments.
 * For PARTIALLY_PAID invoices, this is the next unpaid installment's dueDate.
 * Falls back to the provided invoiceDueDate if no installment date exists.
 */
export function getEffectiveDueDate(
  partialPayments: PartialPaymentRecord[],
  invoiceDueDate: Date,
): Date {
  if (!partialPayments.length) return invoiceDueDate;

  const sorted = [...partialPayments].sort((a, b) => a.sortOrder - b.sortOrder);
  const nextUnpaid = sorted.find((pp) => !pp.isPaid);
  if (!nextUnpaid?.dueDate) return invoiceDueDate;

  return nextUnpaid.dueDate;
}

/**
 * Returns info about the next unpaid installment for a split-payment invoice,
 * or undefined if the invoice has no partial payments.
 */
export function getNextInstallmentInfo(
  partialPayments: PartialPaymentRecord[],
  invoiceTotal: Prisma.Decimal,
): NextInstallmentInfo | undefined {
  if (!partialPayments.length) return undefined;

  const sorted = [...partialPayments].sort((a, b) => a.sortOrder - b.sortOrder);
  const nextUnpaid = sorted.find((pp) => !pp.isPaid);
  if (!nextUnpaid) return undefined;

  return {
    installmentNumber: sorted.indexOf(nextUnpaid) + 1,
    totalInstallments: sorted.length,
    amount: resolvePartialPaymentAmount(nextUnpaid, invoiceTotal).toFixed(2),
    dueDate: nextUnpaid.dueDate?.toLocaleDateString() ?? null,
  };
}
