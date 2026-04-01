/**
 * Late Fee Calculator
 *
 * Pure helper functions for calculating and determining when to apply late fees.
 */

export interface LateFeeConfig {
  enabled: boolean;
  feeType: string | null; // "flat" | "percentage"
  feeRate: number; // flat amount or percentage value
  graceDays: number;
  recurring: boolean;
  intervalDays: number;
  maxApplications: number | null;
}

export interface InvoiceFeeContext {
  dueDate: Date;
  existingFeeCount: number;
  lastFeeDate: Date | null;
}

/**
 * Calculate the late fee amount for a given fee type and invoice total.
 */
export function calculateLateFee(
  feeType: string,
  feeRate: number,
  invoiceTotal: number,
): number {
  if (feeRate <= 0) return 0;
  if (feeType === "flat") return feeRate;
  if (feeType === "percentage") {
    if (invoiceTotal <= 0) return 0;
    return Math.round(invoiceTotal * (feeRate / 100) * 1e10) / 1e10;
  }
  return 0;
}

/**
 * Determine whether a late fee should be applied to an invoice given the org config,
 * the invoice's fee context, and the current time.
 */
export function shouldApplyLateFee(
  config: LateFeeConfig,
  ctx: InvoiceFeeContext,
  now: Date,
): boolean {
  // Must be enabled
  if (!config.enabled) return false;

  // Must be past grace period
  const graceEnd = new Date(ctx.dueDate.getTime() + config.graceDays * 86400000);
  if (now <= graceEnd) return false;

  // First fee: always apply if past grace
  if (ctx.existingFeeCount === 0) return true;

  // Non-recurring: only one fee ever
  if (!config.recurring) return false;

  // Max applications check
  if (config.maxApplications !== null && ctx.existingFeeCount >= config.maxApplications) {
    return false;
  }

  // Recurring interval check: enough time since last fee?
  if (ctx.lastFeeDate) {
    const nextFeeDate = new Date(
      ctx.lastFeeDate.getTime() + config.intervalDays * 86400000,
    );
    if (now < nextFeeDate) return false;
  }

  return true;
}
