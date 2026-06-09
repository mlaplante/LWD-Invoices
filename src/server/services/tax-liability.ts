import type { PrismaClient } from "@/generated/prisma";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";

export type TaxLiabilityParams = {
  from?: Date;
  to?: Date;
  basis: "cash" | "accrual";
};

export type TaxSummaryRow = {
  taxName: string;
  taxRate: number;
  totalCollected: number;
  invoiceCount: number;
};

export type TaxDetailRow = {
  invoiceNumber: string;
  clientName: string;
  invoiceDate: Date;
  invoiceTotal: number;
  taxName: string;
  taxRate: number;
  taxAmount: number;
  paymentStatus: string;
  paymentDate: Date | null;
};

export type TaxLiabilityResult = {
  summary: TaxSummaryRow[];
  details: TaxDetailRow[];
  grandTotal: number;
};

export async function getTaxLiability(
  db: PrismaClient,
  orgId: string,
  params: TaxLiabilityParams,
): Promise<TaxLiabilityResult> {
  const input = params; // preserve the original variable name used in the moved body

      if (input.basis === "accrual") {
        // Accrual: filter by invoice date, exclude credit notes
        const lineTaxes = await db.invoiceLineTax.findMany({
          where: {
            invoiceLine: {
              invoice: {
                organizationId: orgId,
                isArchived: false,
                status: { notIn: [InvoiceStatus.DRAFT] },
                type: { not: InvoiceType.CREDIT_NOTE },
                ...(input.from || input.to
                  ? {
                      date: {
                        ...(input.from ? { gte: input.from } : {}),
                        ...(input.to ? { lte: input.to } : {}),
                      },
                    }
                  : {}),
              },
            },
          },
          include: {
            tax: true,
            invoiceLine: {
              include: {
                invoice: {
                  include: {
                    client: { select: { name: true } },
                    payments: { select: { amount: true, paidAt: true } },
                  },
                },
              },
            },
          },
        });

        const summaryMap = new Map<string, { taxName: string; taxRate: number; totalCollected: number; invoiceIds: Set<string> }>();
        const details: Array<{
          invoiceNumber: string;
          clientName: string;
          invoiceDate: Date;
          invoiceTotal: number;
          taxName: string;
          taxRate: number;
          taxAmount: number;
          paymentStatus: string;
          paymentDate: Date | null;
        }> = [];

        for (const lt of lineTaxes) {
          const inv = lt.invoiceLine.invoice;
          const taxKey = lt.taxId;
          const taxAmount = Number(lt.taxAmount);

          if (!summaryMap.has(taxKey)) {
            summaryMap.set(taxKey, { taxName: lt.tax.name, taxRate: Number(lt.tax.rate), totalCollected: 0, invoiceIds: new Set() });
          }
          const entry = summaryMap.get(taxKey)!;
          entry.totalCollected += taxAmount;
          entry.invoiceIds.add(inv.id);

          const lastPayment = inv.payments.length > 0
            ? inv.payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0].paidAt
            : null;

          details.push({
            invoiceNumber: inv.number,
            clientName: inv.client.name,
            invoiceDate: inv.date,
            invoiceTotal: Number(inv.total),
            taxName: lt.tax.name,
            taxRate: Number(lt.tax.rate),
            taxAmount,
            paymentStatus: inv.status,
            paymentDate: lastPayment,
          });
        }

        const summary = Array.from(summaryMap.values()).map((s) => ({
          taxName: s.taxName,
          taxRate: s.taxRate,
          totalCollected: s.totalCollected,
          invoiceCount: s.invoiceIds.size,
        })).sort((a, b) => b.totalCollected - a.totalCollected);

        const grandTotal = summary.reduce((s, r) => s + r.totalCollected, 0);
        return { summary, details, grandTotal };
      }

      // Cash basis: filter by payment date, prorate tax, exclude credit notes
      const payments = await db.payment.findMany({
        where: {
          organizationId: orgId,
          invoice: { type: { not: InvoiceType.CREDIT_NOTE } },
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        include: {
          invoice: {
            include: {
              client: { select: { name: true } },
              lines: { include: { taxes: { include: { tax: true } } } },
            },
          },
        },
      });

      const summaryMap = new Map<string, { taxName: string; taxRate: number; totalCollected: number; invoiceIds: Set<string> }>();
      const details: Array<{
        invoiceNumber: string;
        clientName: string;
        invoiceDate: Date;
        invoiceTotal: number;
        taxName: string;
        taxRate: number;
        taxAmount: number;
        paymentStatus: string;
        paymentDate: Date | null;
      }> = [];

      for (const payment of payments) {
        const inv = payment.invoice;
        const invoiceTotal = Number(inv.total);
        if (invoiceTotal === 0) continue;
        const paymentRatio = Number(payment.amount) / invoiceTotal;

        for (const line of inv.lines) {
          for (const lt of line.taxes) {
            const proratedTax = Number(lt.taxAmount) * paymentRatio;
            const taxKey = lt.taxId;

            if (!summaryMap.has(taxKey)) {
              summaryMap.set(taxKey, { taxName: lt.tax.name, taxRate: Number(lt.tax.rate), totalCollected: 0, invoiceIds: new Set() });
            }
            const entry = summaryMap.get(taxKey)!;
            entry.totalCollected += proratedTax;
            entry.invoiceIds.add(inv.id);

            details.push({
              invoiceNumber: inv.number,
              clientName: inv.client.name,
              invoiceDate: inv.date,
              invoiceTotal,
              taxName: lt.tax.name,
              taxRate: Number(lt.tax.rate),
              taxAmount: proratedTax,
              paymentStatus: inv.status,
              paymentDate: payment.paidAt,
            });
          }
        }
      }

      const summary = Array.from(summaryMap.values()).map((s) => ({
        taxName: s.taxName,
        taxRate: s.taxRate,
        totalCollected: s.totalCollected,
        invoiceCount: s.invoiceIds.size,
      })).sort((a, b) => b.totalCollected - a.totalCollected);

      const grandTotal = summary.reduce((s, r) => s + r.totalCollected, 0);
      return { summary, details, grandTotal };
}
