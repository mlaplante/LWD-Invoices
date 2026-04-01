import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus, InvoiceType } from "@/generated/prisma";

export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const d = getDate(item);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    result[key] = (result[key] ?? 0) + getValue(item);
  }
  return result;
}

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const reportsRouter = router({
  unpaidInvoices: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          isArchived: false,
          status: {
            in: [
              InvoiceStatus.SENT,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.OVERDUE,
            ],
          },
          ...(input.from || input.to
            ? {
                date: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        include: { client: true, currency: true },
        orderBy: { dueDate: "asc" },
      });
    }),

  overdueInvoices: protectedProcedure
    .query(async ({ ctx }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          isArchived: false,
          status: InvoiceStatus.OVERDUE,
        },
        include: { client: true, currency: true },
        orderBy: { dueDate: "asc" },
      });
    }),

  paymentsByGateway: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
      });
      const byGateway: Record<string, { count: number; total: number; fees: number }> = {};
      for (const p of payments) {
        const key = p.method;
        if (!byGateway[key]) byGateway[key] = { count: 0, total: 0, fees: 0 };
        byGateway[key].count++;
        byGateway[key].total += Number(p.amount);
        byGateway[key].fees += Number(p.gatewayFee);
      }
      return byGateway;
    }),

  expenseBreakdown: protectedProcedure
    .input(dateRangeSchema.extend({ categoryId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expense.findMany({
        where: {
          organizationId: org.id,
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        include: {
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  cashFlowSummary: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999);

    const [thisMonthPayments, lastMonthPayments] = await Promise.all([
      ctx.db.payment.findMany({
        where: { organizationId: ctx.orgId, paidAt: { gte: thisMonthStart } },
        select: { amount: true },
      }),
      ctx.db.payment.findMany({
        where: { organizationId: ctx.orgId, paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        select: { amount: true },
      }),
    ]);

    return {
      thisMonth: thisMonthPayments.reduce((s, p) => s + Number(p.amount), 0),
      lastMonth: lastMonthPayments.reduce((s, p) => s + Number(p.amount), 0),
    };
  }),

  upcomingDue: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return ctx.db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        isArchived: false,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { gte: now, lte: in7Days },
      },
      include: { client: { select: { name: true } }, currency: true },
      orderBy: { dueDate: "asc" },
    });
  }),

  revenueByMonth: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        select: { amount: true, paidAt: true },
      });
      return groupByMonth(
        payments,
        (p) => p.paidAt,
        (p) => Number(p.amount),
      );
    }),

  profitLoss: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;

      const [payments, expenses, discountedInvoices, appliedCredits] = await Promise.all([
        ctx.db.payment.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { paidAt: dateFilter } : {}),
          },
          select: { amount: true, paidAt: true },
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { rate: true, qty: true, createdAt: true },
        }),
        ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            status: { notIn: [InvoiceStatus.DRAFT] },
            discountType: { not: null },
            discountAmount: { gt: 0 },
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: { discountType: true, discountAmount: true, subtotal: true },
        }),
        ctx.db.creditNoteApplication.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { amount: true, createdAt: true },
        }),
      ]);

      const revenueByMonth = groupByMonth(payments, (p) => p.paidAt, (p) => Number(p.amount));
      const expensesByMonth = groupByMonth(
        expenses,
        (e) => e.createdAt,
        (e) => Number(e.rate) * e.qty,
      );
      const creditsByMonth = groupByMonth(
        appliedCredits,
        (c) => c.createdAt,
        (c) => Number(c.amount),
      );

      const allMonths = Array.from(
        new Set([
          ...Object.keys(revenueByMonth),
          ...Object.keys(expensesByMonth),
          ...Object.keys(creditsByMonth),
        ]),
      ).sort();
      const netByMonth: Record<string, number> = {};
      for (const m of allMonths) {
        netByMonth[m] =
          (revenueByMonth[m] ?? 0) -
          (expensesByMonth[m] ?? 0) -
          (creditsByMonth[m] ?? 0);
      }

      const totalRevenue = Object.values(revenueByMonth).reduce((s, v) => s + v, 0);
      const totalExpenses = Object.values(expensesByMonth).reduce((s, v) => s + v, 0);
      const totalCredits = Object.values(creditsByMonth).reduce((s, v) => s + v, 0);

      // Calculate total discounts given
      let totalDiscountsGiven = 0;
      for (const inv of discountedInvoices) {
        if (inv.discountType === "percentage") {
          totalDiscountsGiven += Number(inv.subtotal) * Number(inv.discountAmount) / 100;
        } else {
          totalDiscountsGiven += Number(inv.discountAmount);
        }
      }

      return {
        revenueByMonth,
        expensesByMonth,
        creditsByMonth,
        netByMonth,
        totalRevenue,
        totalExpenses,
        totalCredits,
        netIncome: totalRevenue - totalExpenses - totalCredits,
        totalDiscountsGiven: Math.round(totalDiscountsGiven * 100) / 100,
      };
    }),

  invoiceAging: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const invoices = await ctx.db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        isArchived: false,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      },
      include: { client: { select: { name: true } }, currency: true },
      orderBy: { dueDate: "asc" },
    });

    type AgingInvoice = (typeof invoices)[number] & { daysOverdue: number };

    const buckets: {
      current: AgingInvoice[];
      days1_30: AgingInvoice[];
      days31_60: AgingInvoice[];
      days61_90: AgingInvoice[];
      days90plus: AgingInvoice[];
    } = { current: [], days1_30: [], days31_60: [], days61_90: [], days90plus: [] };

    for (const inv of invoices) {
      const daysOverdue = inv.dueDate
        ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000)
        : 0;
      const enriched = { ...inv, daysOverdue };
      if (daysOverdue <= 0) buckets.current.push(enriched);
      else if (daysOverdue <= 30) buckets.days1_30.push(enriched);
      else if (daysOverdue <= 60) buckets.days31_60.push(enriched);
      else if (daysOverdue <= 90) buckets.days61_90.push(enriched);
      else buckets.days90plus.push(enriched);
    }

    return buckets;
  }),

  timeTracking: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        include: {
          project: { select: { id: true, name: true, rate: true, client: { select: { name: true } } } },
        },
      });

      const byProject = new Map<
        string,
        { projectId: string; projectName: string; clientName: string; totalMinutes: number; billableAmount: number }
      >();

      for (const e of entries) {
        const key = e.projectId;
        if (!byProject.has(key)) {
          byProject.set(key, {
            projectId: e.projectId,
            projectName: e.project.name,
            clientName: e.project.client.name,
            totalMinutes: 0,
            billableAmount: 0,
          });
        }
        const row = byProject.get(key)!;
        const mins = Number(e.minutes);
        row.totalMinutes += mins;
        row.billableAmount += (mins / 60) * Number(e.project.rate);
      }

      return Array.from(byProject.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
    }),

  taxLiability: protectedProcedure
    .input(
      dateRangeSchema.extend({
        basis: z.enum(["cash", "accrual"]).default("accrual"),
      })
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.basis === "accrual") {
        // Accrual: filter by invoice date, exclude credit notes
        const lineTaxes = await ctx.db.invoiceLineTax.findMany({
          where: {
            invoiceLine: {
              invoice: {
                organizationId: org.id,
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
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
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
    }),

  expenseCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.expenseCategory.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }),

  retainerLiability: protectedProcedure.query(async ({ ctx }) => {
    const retainers = await ctx.db.retainer.findMany({
      where: {
        organizationId: ctx.orgId,
        balance: { gt: 0 },
      },
      include: {
        client: { select: { id: true, name: true, email: true } },
      },
      orderBy: { balance: "desc" },
    });

    const total = retainers.reduce((s, r) => s + Number(r.balance), 0);

    return {
      retainers: retainers.map((r) => ({
        clientId: r.client.id,
        clientName: r.client.name,
        clientEmail: r.client.email,
        balance: Number(r.balance),
        updatedAt: r.updatedAt,
      })),
      totalLiability: total,
    };
  }),
});
