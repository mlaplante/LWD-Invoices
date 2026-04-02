/**
 * Tax Calculator Service
 *
 * Exact TypeScript port of Pancake's rows_with_tax_total() compound-tax algorithm.
 *
 * Algorithm (per line):
 *   1. subtotal = qty × rate (× period if period line type)
 *   2. Apply item-level discount (percentage or fixed)
 *   3. [Invoice-level discounts are handled at the invoice level, not per-line here]
 *   4. Non-compound taxes: each adds (rate/100 × discountedSubtotal) — do NOT compound
 *   5. Compound taxes IN ORDER: each adds (rate/100 × running) and increases running
 */

import { LineType, type PrismaClient } from "@/generated/prisma";

const PERIOD_TYPES = new Set<LineType>([
  LineType.PERIOD_DAY,
  LineType.PERIOD_WEEK,
  LineType.PERIOD_MONTH,
  LineType.PERIOD_YEAR,
]);


export type TaxInput = {
  id: string;
  rate: number; // e.g. 13.0 for 13%
  isCompound: boolean;
};

export type LineInput = {
  qty: number;
  rate: number;
  period?: number | null;
  lineType: LineType;
  discount: number;
  discountIsPercentage: boolean;
  taxIds: string[];
};

export type TaxBreakdown = {
  taxId: string;
  taxAmount: number;
};

export type LineResult = {
  subtotal: number; // after item discount, before taxes
  taxBreakdown: TaxBreakdown[];
  taxTotal: number;
  total: number;
};

export type InvoiceTotals = {
  subtotal: number; // sum of all line subtotals (before any invoice discounts)
  discountTotal: number; // sum of all invoice-level discount line amounts
  taxTotal: number;
  total: number;
};

export type InvoiceTotalsWithDiscount = InvoiceTotals & {
  invoiceDiscount: number; // the invoice-level discount amount applied
};

function round(n: number, places = 10): number {
  return Math.round(n * 10 ** places) / 10 ** places;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate totals for a single line item.
 * `taxes` should only include taxes whose ids appear in line.taxIds.
 * Taxes must be sorted so non-compound come before compound (or pass all and we sort).
 */
export function calculateLineTotals(
  line: LineInput,
  taxes: TaxInput[]
): LineResult {
  // 1. Gross subtotal
  let subtotal: number;
  if (PERIOD_TYPES.has(line.lineType) && line.period != null) {
    subtotal = round(line.qty * line.rate * line.period);
  } else {
    subtotal = round(line.qty * line.rate);
  }

  // 2. Item-level discount
  if (line.lineType === LineType.PERCENTAGE_DISCOUNT) {
    // Percentage discount lines represent a percentage of the running total —
    // calculated at invoice level, not here. Return 0.
    return { subtotal: 0, taxBreakdown: [], taxTotal: 0, total: 0 };
  }
  if (line.lineType === LineType.FIXED_DISCOUNT) {
    // Fixed discount lines are negative amounts — return negative subtotal.
    const discountAmount = round(line.rate);
    return {
      subtotal: -discountAmount,
      taxBreakdown: [],
      taxTotal: 0,
      total: -discountAmount,
    };
  }

  // Apply item-level discount
  if (line.discount > 0) {
    if (line.discountIsPercentage) {
      subtotal = round(subtotal * (1 - line.discount / 100));
    } else {
      subtotal = round(subtotal - line.discount);
    }
  }

  // 3. Resolve applicable taxes
  const applicableTaxes = taxes.filter((t) => line.taxIds.includes(t.id));
  const nonCompound = applicableTaxes.filter((t) => !t.isCompound);
  const compound = applicableTaxes.filter((t) => t.isCompound);

  // 4. Non-compound taxes (each based on discountedSubtotal)
  const taxBreakdown: TaxBreakdown[] = [];
  let taxTotal = 0;

  for (const tax of nonCompound) {
    const amount = round(subtotal * (tax.rate / 100));
    taxBreakdown.push({ taxId: tax.id, taxAmount: amount });
    taxTotal = round(taxTotal + amount);
  }

  // 5. Compound taxes (each applies to subtotal + all previous taxes)
  let running = round(subtotal + taxTotal);
  for (const tax of compound) {
    const amount = round(running * (tax.rate / 100));
    taxBreakdown.push({ taxId: tax.id, taxAmount: amount });
    taxTotal = round(taxTotal + amount);
    running = round(running + amount);
  }

  return {
    subtotal: round2(subtotal),
    taxBreakdown,
    taxTotal: round2(taxTotal),
    total: round2(subtotal + taxTotal),
  };
}

/**
 * Calculate invoice-level totals across all lines.
 *
 * Handles PERCENTAGE_DISCOUNT lines at invoice level — each applies to the
 * running subtotal of all preceding non-discount lines.
 */
export function calculateInvoiceTotals(
  lines: LineInput[],
  allTaxes: TaxInput[]
): InvoiceTotals {
  let runningSubtotal = 0; // tracks pre-discount subtotal for pct discount lines
  let subtotalAccum = 0; // sum of non-discount line subtotals
  let discountTotal = 0;
  let taxTotal = 0;

  for (const line of lines) {
    if (line.lineType === LineType.PERCENTAGE_DISCOUNT) {
      const discountAmount = round(runningSubtotal * (line.rate / 100));
      discountTotal = round(discountTotal + discountAmount);
      runningSubtotal = round(runningSubtotal - discountAmount);
      continue;
    }

    if (line.lineType === LineType.FIXED_DISCOUNT) {
      const discountAmount = round(line.rate);
      discountTotal = round(discountTotal + discountAmount);
      runningSubtotal = round(runningSubtotal - discountAmount);
      continue;
    }

    const lineTaxes = allTaxes.filter((t) => line.taxIds.includes(t.id));
    const result = calculateLineTotals(line, lineTaxes);

    subtotalAccum = round(subtotalAccum + result.subtotal);
    runningSubtotal = round(runningSubtotal + result.subtotal);
    taxTotal = round(taxTotal + result.taxTotal);
  }

  const total = round(subtotalAccum - discountTotal + taxTotal);

  return {
    subtotal: round2(subtotalAccum),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(total),
  };
}

/**
 * Calculate invoice totals with an invoice-level discount applied.
 *
 * The invoice-level discount is applied BEFORE tax — meaning the discount reduces
 * the taxable subtotal. The discount is prorated across standard lines so taxes
 * are recalculated on the reduced amounts.
 *
 * @param discountType - "percentage" | "fixed" | null/undefined
 * @param discountAmount - the discount value (percentage 0-100 or fixed amount)
 */
export function calculateInvoiceTotalsWithDiscount(
  lines: LineInput[],
  allTaxes: TaxInput[],
  discountType: string | null | undefined,
  discountAmount: number
): InvoiceTotalsWithDiscount {
  // First, compute the base totals without invoice-level discount
  // We need the raw subtotal from standard lines (after line-item discounts)
  let rawSubtotal = 0;
  let lineDiscountTotal = 0;

  // Collect standard line results for tax recalculation
  const standardLines: { line: LineInput; subtotal: number }[] = [];

  for (const line of lines) {
    if (line.lineType === LineType.PERCENTAGE_DISCOUNT) {
      const discAmt = round(rawSubtotal * (line.rate / 100));
      lineDiscountTotal = round(lineDiscountTotal + discAmt);
      rawSubtotal = round(rawSubtotal - discAmt);
      continue;
    }
    if (line.lineType === LineType.FIXED_DISCOUNT) {
      const discAmt = round(line.rate);
      lineDiscountTotal = round(lineDiscountTotal + discAmt);
      rawSubtotal = round(rawSubtotal - discAmt);
      continue;
    }

    const lineTaxes = allTaxes.filter((t) => line.taxIds.includes(t.id));
    const result = calculateLineTotals(line, lineTaxes);
    standardLines.push({ line, subtotal: result.subtotal });
    rawSubtotal = round(rawSubtotal + result.subtotal);
  }

  // Calculate the invoice-level discount amount
  let invoiceDiscount = 0;
  if (discountType === "fixed" && discountAmount > 0) {
    // Cap at the post-line-discount subtotal
    invoiceDiscount = round2(Math.min(discountAmount, Math.max(rawSubtotal, 0)));
  } else if (discountType === "percentage" && discountAmount > 0) {
    const cappedPct = Math.min(discountAmount, 100);
    invoiceDiscount = round2(round(rawSubtotal * (cappedPct / 100)));
  }

  if (invoiceDiscount <= 0) {
    // No invoice-level discount — use standard calculation
    const base = calculateInvoiceTotals(lines, allTaxes);
    return { ...base, invoiceDiscount: 0 };
  }

  // Prorate the invoice discount across standard lines and recalculate taxes
  const totalStandardSubtotal = standardLines.reduce((s, l) => s + l.subtotal, 0);
  let taxTotal = 0;

  if (totalStandardSubtotal > 0) {
    for (const { line, subtotal } of standardLines) {
      const proportion = subtotal / totalStandardSubtotal;
      const lineShare = round(invoiceDiscount * proportion);
      const adjustedSubtotal = round(subtotal - lineShare);

      // Recalculate taxes on the adjusted subtotal
      const applicableTaxes = allTaxes.filter((t) => line.taxIds.includes(t.id));
      const nonCompound = applicableTaxes.filter((t) => !t.isCompound);
      const compound = applicableTaxes.filter((t) => t.isCompound);

      let lineTax = 0;
      for (const tax of nonCompound) {
        lineTax = round(lineTax + round(adjustedSubtotal * (tax.rate / 100)));
      }
      let running = round(adjustedSubtotal + lineTax);
      for (const tax of compound) {
        const amt = round(running * (tax.rate / 100));
        lineTax = round(lineTax + amt);
        running = round(running + amt);
      }

      taxTotal = round(taxTotal + lineTax);
    }
  }

  const subtotal = round2(totalStandardSubtotal);
  const totalDiscounts = round2(lineDiscountTotal + invoiceDiscount);
  const total = round2(subtotal - totalDiscounts + taxTotal);

  return {
    subtotal,
    discountTotal: totalDiscounts,
    taxTotal: round2(taxTotal),
    total,
    invoiceDiscount: round2(invoiceDiscount),
  };
}

/**
 * Load all taxes for an organization and return them as a Map<taxId, TaxInput>.
 */
export async function getOrgTaxMap(
  db: PrismaClient,
  orgId: string,
): Promise<Map<string, TaxInput>> {
  const taxes = await db.tax.findMany({ where: { organizationId: orgId } });
  return new Map(
    taxes.map((t) => [
      t.id,
      { id: t.id, rate: t.rate.toNumber(), isCompound: t.isCompound },
    ]),
  );
}
