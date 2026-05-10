import { TRPCError } from "@trpc/server";

/**
 * Refuses line-append operations on an invoice that was tax-calculated via
 * Stripe Tax. Adding lines through the legacy calculator (expense/task/time
 * → invoice flows) would write InvoiceLineTax rows alongside existing
 * InvoiceLineStripeTaxBreakdown rows, mixing tax shapes and producing wrong
 * invoice totals.
 *
 * The standard invoice edit flow goes through resolveInvoiceTax which
 * handles both paths correctly, so we direct users there.
 */
export function assertNotStripeTaxInvoice(invoice: { stripeTaxCalculationId: string | null }): void {
  if (invoice.stripeTaxCalculationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This invoice uses Stripe Tax. Add expenses, tasks, or time directly via the invoice editor (which recomputes tax through Stripe), not via the bill-to-invoice shortcut.",
    });
  }
}
