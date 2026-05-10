import type { FullInvoice } from "../invoice-pdf";
import type { InvoiceTemplateConfig } from "../invoice-template-config";

export type TemplateProps = {
  invoice: FullInvoice;
  config: InvoiceTemplateConfig;
};

/**
 * Aggregates per-line, per-jurisdiction Stripe Tax breakdowns into one row
 * per (jurisdiction, rate) so the PDF totals section can show, e.g.,
 *   California State Sales Tax 6%   $12.00
 *   Los Angeles County 1%           $2.00
 * instead of one summary "Tax" line.
 *
 * Returns empty array for legacy invoices (no stripeTaxBreakdown rows).
 */
export function aggregateStripeTaxBreakdowns(invoice: FullInvoice): Array<{
  label: string;
  amount: number;
}> {
  const buckets = new Map<string, { label: string; amount: number }>();
  for (const line of invoice.lines) {
    for (const b of line.stripeTaxBreakdown ?? []) {
      const rate = Number(b.rateDecimal);
      const key = `${b.jurisdictionDisplay}|${rate}`;
      const label = `${b.jurisdictionDisplay} ${rate}%`;
      const amount = Number(b.amount);
      const existing = buckets.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        buckets.set(key, { label, amount });
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.amount - a.amount);
}
