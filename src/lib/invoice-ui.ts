import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";

/**
 * Shared display config for invoice statuses and types, used by the admin
 * invoice tables and the client portal so labels and colors stay in sync.
 */

export type StatusBadgeConfig = { label: string; className: string; dot: string };

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, StatusBadgeConfig> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
};

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
