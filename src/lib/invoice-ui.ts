import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";

/**
 * Shared display config for invoice statuses and types, used by the admin
 * invoice tables and the client portal so labels and colors stay in sync.
 */

export type StatusBadgeConfig = { label: string; className: string; dot: string };

/**
 * Status tints follow the La Plante pill ramp — a ~10% fill of the status
 * colour with the text at full strength. Hard-coded palette colours are
 * deliberately avoided so these follow the theme into dark mode.
 */
export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, StatusBadgeConfig> = {
  DRAFT:          { label: "Draft",    className: "bg-black/5 text-[#777] dark:bg-white/8 dark:text-muted-foreground", dot: "bg-muted-foreground" },
  SENT:           { label: "Sent",     className: "bg-primary/8 text-primary dark:bg-primary/25 dark:text-accent-foreground", dot: "bg-primary" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-warning/12 text-warning-foreground", dot: "bg-warning" },
  PAID:           { label: "Paid",     className: "bg-success/10 text-success-foreground", dot: "bg-success" },
  OVERDUE:        { label: "Overdue",  className: "bg-danger/10 text-danger-foreground",   dot: "bg-danger" },
  ACCEPTED:       { label: "Accepted", className: "bg-success/10 text-success-foreground", dot: "bg-success" },
  REJECTED:       { label: "Rejected", className: "bg-black/5 text-[#777] dark:bg-white/8 dark:text-muted-foreground", dot: "bg-muted-foreground" },
};

/** Shown in place of the status badge while a bank debit (ACH / SEPA) settles. */
export const BANK_PAYMENT_PROCESSING_BADGE: StatusBadgeConfig = {
  label: "Processing",
  className: "bg-primary/8 text-primary dark:bg-primary/25 dark:text-accent-foreground",
  dot: "bg-primary",
};

const PROCESSING_ELIGIBLE: readonly InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

/**
 * True while a bank-debit payment is pending settlement. Gated on a payable
 * status so a stale timestamp (e.g. invoice later marked paid by hand) never
 * shows "Processing" on a paid invoice.
 */
export function isBankPaymentProcessing(inv: {
  status: InvoiceStatus;
  bankPaymentProcessingAt?: Date | string | null;
}): boolean {
  return !!inv.bankPaymentProcessingAt && PROCESSING_ELIGIBLE.includes(inv.status);
}

/** Badge lookup that tolerates plain-string statuses (e.g. serialized portal rows). */
export function invoiceStatusBadge(status: string): StatusBadgeConfig {
  return INVOICE_STATUS_BADGE[status as InvoiceStatus] ?? INVOICE_STATUS_BADGE.DRAFT;
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  DETAILED: "Invoice",
  SIMPLE:   "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
  DEPOSIT: "Deposit",
};
