/**
 * Retainer / Deposit Helpers
 *
 * Pure functions for retainer deposit and drawdown validation.
 */

export interface DepositInput {
  amount: number;
  method?: string;
}

export interface DrawdownInput {
  retainerBalance: number;
  invoiceTotal: number;
  invoicePaid: number;
  retainerAlreadyApplied: number;
  requestedAmount: number;
}

/**
 * Calculate the maximum amount that can be drawn down from a retainer for an invoice.
 * The cap is the lesser of the retainer balance and the remaining unpaid invoice amount.
 */
export function calculateDrawdownAmount(
  retainerBalance: number,
  invoiceTotal: number,
  invoicePaid: number,
  retainerAlreadyApplied: number,
): number {
  if (retainerBalance <= 0) return 0;
  const remaining = invoiceTotal - invoicePaid - retainerAlreadyApplied;
  if (remaining <= 0) return 0;
  return Math.min(retainerBalance, remaining);
}

/**
 * Validate a deposit input. Returns null if valid, or an error message string.
 */
export function validateDeposit(input: DepositInput): string | null {
  if (input.amount <= 0) return "Deposit amount must be greater than zero";
  if (!Number.isFinite(input.amount)) return "Deposit amount must be a finite number";
  return null;
}

/**
 * Validate a drawdown input. Returns null if valid, or an error message string.
 */
export function validateDrawdown(input: DrawdownInput): string | null {
  if (input.requestedAmount <= 0) return "Drawdown amount must be greater than zero";
  if (!Number.isFinite(input.requestedAmount)) return "Drawdown amount must be a finite number";

  if (input.requestedAmount > input.retainerBalance) {
    return "Drawdown amount exceeds retainer balance";
  }

  const remaining =
    input.invoiceTotal - input.invoicePaid - input.retainerAlreadyApplied;
  if (remaining <= 0) return "Invoice is already fully paid";

  if (input.requestedAmount > remaining) {
    return "Drawdown amount exceeds invoice remaining balance";
  }

  return null;
}
