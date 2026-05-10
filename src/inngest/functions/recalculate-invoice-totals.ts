import { inngest } from "../client";
import { db } from "@/server/db";
import { resolveInvoiceTax } from "@/server/services/invoice-tax-resolver";
import { getOrgTaxMap } from "@/server/services/tax-calculator";
import { LineType } from "@/generated/prisma";

/**
 * Recalculate invoice totals when a tax row is deleted.
 *
 * Without this, the InvoiceLineTax rows still reference the deleted Tax
 * via FK (Prisma cascades the join row), but the cached subtotal/taxTotal/
 * total on Invoice and InvoiceLine drift from the new reality. Reports
 * then aggregate stale totals.
 *
 * Triggered by sending `org/tax.deleted` { orgId, taxId } from the taxes
 * router on delete. Limits the rebuild to invoices that referenced the
 * deleted tax — typically a small fan-out.
 *
 * Skips PAID / OVERDUE invoices: changing totals on a finalized invoice
 * is an accounting issue, not a stale-cache issue. Those need an explicit
 * credit note instead.
 */
export const recalculateInvoiceTotals = inngest.createFunction(
  {
    id: "recalculate-invoice-totals",
    name: "Recalculate Invoice Totals (tax delete)",
    triggers: [{ event: "org/tax.deleted" }],
  },
  async ({ event, step }) => {
    const { orgId, taxId } = event.data as { orgId: string; taxId: string };

    const affectedInvoices = await step.run("find-affected", async () => {
      const lines = await db.invoiceLine.findMany({
        where: {
          taxes: { some: { taxId } },
          invoice: {
            organizationId: orgId,
            status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID"] },
          },
        },
        select: { invoiceId: true },
        distinct: ["invoiceId"],
      });
      return lines.map((l) => l.invoiceId);
    });

    if (affectedInvoices.length === 0) {
      return { recalculated: 0 };
    }

    const org = await step.run("load-org", async () =>
      db.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: {
          id: true,
          stripeTaxEnabled: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      }),
    );

    let count = 0;
    for (const invoiceId of affectedInvoices) {
      await step.run(`recalc-${invoiceId}`, async () => {
        const invoice = await db.invoice.findUnique({
          where: { id: invoiceId },
          include: { lines: { include: { taxes: true } } },
        });
        if (!invoice) return;
        const taxMap = await getOrgTaxMap(db, orgId);
        const resolved = await resolveInvoiceTax({
          db,
          org,
          clientId: invoice.clientId,
          currencyId: invoice.currencyId,
          discountType: invoice.discountType as "percentage" | "fixed" | null,
          discountAmount: invoice.discountAmount.toNumber(),
          taxMap,
          lines: invoice.lines.map((l) => ({
            reference: String(l.sort),
            qty: l.qty.toNumber(),
            rate: l.rate.toNumber(),
            period: l.period?.toNumber() ?? null,
            lineType: l.lineType as LineType,
            discount: l.discount.toNumber(),
            discountIsPercentage: l.discountIsPercentage,
            taxIds: l.taxes.filter((t) => t.taxId !== taxId).map((t) => t.taxId),
          })),
        });
        await db.invoice.update({
          where: { id: invoiceId },
          data: {
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
          },
        });
        count++;
      });
    }

    return { recalculated: count };
  },
);
