import "server-only";
import type Stripe from "stripe";
import {
  calculateInvoiceTax,
  type TaxAddress,
  type TaxBreakdownLine,
} from "./stripe-tax";

/**
 * Phase B2 helper: prepares invoice line input for Stripe Tax, calls the
 * Calculation API, and reshapes the response into something invoice.create /
 * update / recurring expansion / credit-note issuance can persist as
 * InvoiceLineStripeTaxBreakdown rows + invoice totals.
 *
 * The math contract:
 *   1. Caller computes per-line subtotal AFTER item-level discount but
 *      BEFORE any invoice-level discount.
 *   2. This helper applies the invoice-level discount proportionally
 *      across lines (matching how calculateInvoiceTotalsWithDiscount
 *      handles it), then ships the post-discount amount to Stripe.
 *   3. Tax returned by Stripe is per-line; we sum to invoice.taxTotal.
 *   4. invoice.total = sum(line postDiscount subtotal) + invoice taxTotal
 *      (i.e. total = subtotal - discountTotal + taxTotal).
 *
 * The caller is responsible for writing the invoice + line rows + the
 * InvoiceLineStripeTaxBreakdown rows from the returned data.
 */

export type InvoiceTaxLineInput = {
  /** stable id used both by Stripe `reference` and by the caller to map back */
  reference: string;
  /** post-item-discount line subtotal in major currency units */
  preDiscountSubtotal: number;
  /** Stripe tax product code; default txcd_99999999 (general services) */
  taxCode?: string;
  /** "exclusive" (default): tax added on top; "inclusive": amount includes tax */
  taxBehavior?: "exclusive" | "inclusive";
};

export type InvoiceTaxResult = {
  calculationId: string;
  /** discount applied across all lines combined */
  discountTotal: number;
  /** sum of post-discount line subtotals = sum of preDiscountSubtotal - discountTotal */
  subtotal: number;
  /** sum of all line tax amounts returned by Stripe */
  taxTotal: number;
  /** subtotal + taxTotal */
  total: number;
  /** per-line breakdown ready to persist */
  lines: Array<{
    reference: string;
    /** line subtotal AFTER applying the invoice-level discount share */
    subtotal: number;
    /** total tax for this line, summed across jurisdictions */
    taxTotal: number;
    /** subtotal + taxTotal */
    total: number;
    /** rows to persist on InvoiceLineStripeTaxBreakdown */
    breakdown: TaxBreakdownLine["breakdowns"];
  }>;
};

export type InvoiceDiscount =
  | { type: "percentage"; amount: number }
  | { type: "fixed"; amount: number }
  | null;

/**
 * Distributes invoice-level discount across lines proportionally to each
 * line's pre-discount subtotal. Mirrors the behavior of
 * calculateInvoiceTotalsWithDiscount in tax-calculator.ts.
 *
 * Returns post-discount subtotals (same length/order as input).
 * Total discount equals the sum of (pre - post) across lines and is
 * never larger than the pre-discount subtotal sum.
 */
export function distributeDiscount(
  lines: InvoiceTaxLineInput[],
  discount: InvoiceDiscount,
): { postDiscount: number[]; discountTotal: number } {
  const preTotal = lines.reduce((s, l) => s + l.preDiscountSubtotal, 0);
  if (!discount || discount.amount <= 0 || preTotal <= 0) {
    return { postDiscount: lines.map((l) => l.preDiscountSubtotal), discountTotal: 0 };
  }

  const totalDiscount =
    discount.type === "percentage"
      ? Math.min(preTotal, preTotal * (discount.amount / 100))
      : Math.min(preTotal, discount.amount);

  const postDiscount = lines.map((l) =>
    Math.max(0, l.preDiscountSubtotal - totalDiscount * (l.preDiscountSubtotal / preTotal)),
  );
  return { postDiscount, discountTotal: totalDiscount };
}

export async function computeInvoiceTaxViaStripe(
  stripe: Stripe,
  args: {
    currency: string;
    origin: TaxAddress;
    destination: TaxAddress;
    customerTaxId?: { type: string; value: string };
    lines: InvoiceTaxLineInput[];
    discount: InvoiceDiscount;
  },
): Promise<InvoiceTaxResult> {
  const { postDiscount, discountTotal } = distributeDiscount(args.lines, args.discount);

  const calc = await calculateInvoiceTax(stripe, {
    currency: args.currency,
    origin: args.origin,
    destination: args.destination,
    customerTaxId: args.customerTaxId,
    lines: args.lines.map((l, i) => ({
      reference: l.reference,
      amount: postDiscount[i],
      taxCode: l.taxCode,
      taxBehavior: l.taxBehavior,
    })),
  });

  // Reorder Stripe response to match input ordering by reference.
  const byRef = new Map(calc.lines.map((l) => [l.reference, l]));
  const lines = args.lines.map((input, i) => {
    const stripeLine = byRef.get(input.reference);
    const subtotal = postDiscount[i];
    const taxTotal = stripeLine?.amountTax ?? 0;
    return {
      reference: input.reference,
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      breakdown: stripeLine?.breakdowns ?? [],
    };
  });

  const subtotal = postDiscount.reduce((s, n) => s + n, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxTotal, 0);

  return {
    calculationId: calc.calculationId,
    discountTotal,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
    lines,
  };
}
