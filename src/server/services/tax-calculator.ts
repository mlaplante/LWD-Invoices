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

import { LineType } from "@/generated/prisma";

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
