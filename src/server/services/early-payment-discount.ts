/**
 * Early-payment discount ("2/10 net 30") — pure offer/redemption math.
 *
 * The offer is snapshotted onto the invoice at creation (percent + days) so
 * changing the org default never rewrites outstanding invoices. The discount
 * is applied POST-TAX at redemption: most jurisdictions tax the original sale
 * regardless of a prompt-pay discount, and post-tax matches how the existing
 * FIXED_DISCOUNT line type folds into calculateInvoiceTotals (discountTotal
 * is subtracted after taxTotal is computed).
 *
 * Redemption itself (payment row + FIXED_DISCOUNT line + cached-total updates)
 * lives in the Stripe webhook, which validates against this module's output
 * carried on the checkout session metadata.
 */

export type EarlyPayOffer = {
  percent: number;
  /** Last instant the discounted amount can be initiated (end of day UTC). */
  deadline: Date;
  /** Remaining balance before the discount. */
  balance: number;
  discountAmount: number;
  discountedBalance: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** End of day (UTC) `days` after the invoice date. */
export function getEarlyPayDeadline(invoiceDate: Date, days: number): Date {
  const deadline = new Date(invoiceDate);
  deadline.setUTCDate(deadline.getUTCDate() + days);
  deadline.setUTCHours(23, 59, 59, 999);
  return deadline;
}

/**
 * Resolve the live offer for an invoice, or null when no discount applies.
 *
 * Gates:
 * - an offer was snapshotted (percent > 0, days != null) and not yet redeemed
 * - invoice is in a payable, non-final status
 * - no installment schedule (the discount is for paying the full balance —
 *   installment plans already negotiate their own terms)
 * - now is on or before the deadline and the discounted balance stays > 0
 */
export function resolveEarlyPayOffer(opts: {
  percent: number | null | undefined;
  days: number | null | undefined;
  invoiceDate: Date;
  status: string;
  total: number;
  paidSoFar: number;
  hasInstallments: boolean;
  redeemedAt: Date | null | undefined;
  now: Date;
}): EarlyPayOffer | null {
  const percent = opts.percent ?? 0;
  if (percent <= 0 || percent >= 100) return null;
  if (opts.days == null || opts.days < 0) return null;
  if (opts.redeemedAt) return null;
  if (opts.hasInstallments) return null;
  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(opts.status)) return null;

  const deadline = getEarlyPayDeadline(opts.invoiceDate, opts.days);
  if (opts.now.getTime() > deadline.getTime()) return null;

  const balance = round2(opts.total - opts.paidSoFar);
  if (balance <= 0) return null;

  const discountAmount = round2(balance * (percent / 100));
  const discountedBalance = round2(balance - discountAmount);
  if (discountAmount <= 0 || discountedBalance <= 0) return null;

  return { percent, deadline, balance, discountAmount, discountedBalance };
}

/**
 * Split a discounted checkout charge into payment + surcharge for the books.
 * `chargedAmount` is what Stripe actually collected (discounted balance plus
 * any card/bank surcharge); the payment row records the discounted balance and
 * the rest is surcharge. Clamped so a weird charge can't produce negatives.
 */
export function computeEarlyPayRedemption(opts: {
  invoiceTotal: number;
  existingPaid: number;
  discountAmount: number;
  chargedAmount: number;
}): { paymentAmount: number; surchargeAmount: number; newInvoiceTotal: number } {
  const newInvoiceTotal = round2(opts.invoiceTotal - opts.discountAmount);
  const paymentAmount = round2(Math.max(0, newInvoiceTotal - opts.existingPaid));
  const surchargeAmount = round2(Math.max(0, opts.chargedAmount - paymentAmount));
  return { paymentAmount, surchargeAmount, newInvoiceTotal };
}

/** Display label used on the portal, emails, and the appended discount line. */
export function earlyPayDiscountLabel(percent: number, days: number): string {
  return `Early payment discount (${percent}% — paid within ${days} day${days === 1 ? "" : "s"})`;
}
