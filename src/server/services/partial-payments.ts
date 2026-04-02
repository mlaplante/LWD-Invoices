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
    amount: nextUnpaid.isPercentage
      ? ((nextUnpaid.amount.toNumber() / 100) * invoiceTotal.toNumber()).toFixed(2)
      : nextUnpaid.amount.toNumber().toFixed(2),
    dueDate: nextUnpaid.dueDate?.toLocaleDateString() ?? null,
  };
}
