import type { Prisma } from "@/generated/prisma";

/**
 * How long a bank debit (ACH / SEPA) may sit in "Processing" before the
 * collection crons stop deferring to it. ACH settles in ~4 business days and
 * SEPA in up to 14; past this window the async_payment_* webhook was most
 * likely lost, and silently suppressing reminders forever would be worse than
 * a reminder the client can ignore.
 */
export const BANK_PAYMENT_PROCESSING_MAX_DAYS = 30;

/**
 * Invoice filter for reminder, late-fee and auto-charge crons: excludes
 * invoices whose bank debit is still settling, so a client who has already
 * paid isn't chased, fined, or charged a second time.
 */
export function notSettlingBankPayment(now: Date): Prisma.InvoiceWhereInput {
  const cutoff = new Date(now.getTime() - BANK_PAYMENT_PROCESSING_MAX_DAYS * 86_400_000);
  return {
    OR: [{ bankPaymentProcessingAt: null }, { bankPaymentProcessingAt: { lt: cutoff } }],
  };
}
