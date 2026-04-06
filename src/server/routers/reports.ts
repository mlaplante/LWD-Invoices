import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus, InvoiceType, RecurringFrequency } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

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
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
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
        include: {
          client: { select: { id: true, name: true } },
          currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } },
        },
        orderBy: { dueDate: "asc" },
      });
    }),

  overdueInvoices: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isArchived: false,
          status: InvoiceStatus.OVERDUE,
        },
        include: {
          client: { select: { id: true, name: true } },
          currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } },
        },
        orderBy: { dueDate: "asc" },
      });
    }),

  paymentsByGateway: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.payment.groupBy({
        by: ["method"],
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? {
                paidAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        _count: true,
        _sum: { amount: true, gatewayFee: true },
      });
      const byGateway: Record<string, { count: number; total: number; fees: number }> = {};
      for (const g of groups) {
        byGateway[g.method] = {
          count: g._count,
          total: Number(g._sum.amount ?? 0),
          fees: Number(g._sum.gatewayFee ?? 0),
        };
      }
      return byGateway;
    }),

  expenseBreakdown: protectedProcedure
    .input(dateRangeSchema.extend({ categoryId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
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

    const [thisMonthAgg, lastMonthAgg] = await Promise.all([
      ctx.db.payment.aggregate({
        where: { organizationId: ctx.orgId, paidAt: { gte: thisMonthStart } },
        _sum: { amount: true },
      }),
      ctx.db.payment.aggregate({
        where: { organizationId: ctx.orgId, paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { amount: true },
      }),
    ]);

    return {
      thisMonth: Number(thisMonthAgg._sum.amount ?? 0),
      lastMonth: Number(lastMonthAgg._sum.amount ?? 0),
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
      include: { client: { select: { name: true } }, currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } } },
      orderBy: { dueDate: "asc" },
    });
  }),

  revenueByMonth: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT to_char("paidAt", 'YYYY-MM') AS month, SUM(amount)::float AS total
        FROM "Payment"
        WHERE "organizationId" = ${ctx.orgId}
          ${input.from ? Prisma.sql`AND "paidAt" >= ${input.from}` : Prisma.empty}
          ${input.to ? Prisma.sql`AND "paidAt" <= ${input.to}` : Prisma.empty}
        GROUP BY month
        ORDER BY month
      `;
      const result: Record<string, number> = {};
      for (const r of rows) result[r.month] = r.total;
      return result;
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

  profitabilityByClient: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;

      // Revenue: payments grouped by invoice's clientId
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(dateFilter ? { paidAt: dateFilter } : {}),
        },
        select: {
          amount: true,
          invoice: { select: { clientId: true } },
        },
      });

      // Costs: expenses via project.clientId + time entry cost via project
      const [expenses, timeEntries] = await Promise.all([
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            project: { isNot: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: {
            rate: true,
            qty: true,
            project: { select: { clientId: true } },
          },
        }),
        ctx.db.timeEntry.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: {
            minutes: true,
            project: { select: { clientId: true, rate: true } },
          },
        }),
      ]);

      // Client names
      const clients = await ctx.db.client.findMany({
        where: { organizationId: ctx.orgId },
        select: { id: true, name: true },
      });
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));

      // Aggregate by clientId
      const revenueByClient: Record<string, number> = {};
      for (const p of payments) {
        const cid = p.invoice.clientId;
        revenueByClient[cid] = (revenueByClient[cid] ?? 0) + Number(p.amount);
      }

      const costByClient: Record<string, number> = {};
      for (const e of expenses) {
        if (!e.project) continue;
        const cid = e.project.clientId;
        costByClient[cid] = (costByClient[cid] ?? 0) + Number(e.rate) * e.qty;
      }
      for (const t of timeEntries) {
        if (!t.project) continue;
        const cid = t.project.clientId;
        const hours = Number(t.minutes) / 60;
        costByClient[cid] = (costByClient[cid] ?? 0) + hours * Number(t.project.rate);
      }

      const allClientIds = Array.from(
        new Set([...Object.keys(revenueByClient), ...Object.keys(costByClient)])
      );

      const rows = allClientIds.map((cid) => {
        const revenue = revenueByClient[cid] ?? 0;
        const costs = costByClient[cid] ?? 0;
        const margin = revenue - costs;
        return {
          clientId: cid,
          clientName: clientMap.get(cid) ?? "Unknown",
          revenue: Math.round(revenue * 100) / 100,
          costs: Math.round(costs * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
        };
      });

      rows.sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
      const totalMargin = totalRevenue - totalCosts;

      return {
        rows,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalMargin: Math.round(totalMargin * 100) / 100,
        avgMarginPercent: totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 10000) / 100 : 0,
      };
    }),

  profitabilityByProject: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;

      // Revenue: invoice lines sourced from TimeEntry or Expense, on paid/sent invoices.
      // TimeEntry.invoiceLineId and Expense.invoiceLineId store the InvoiceLine id,
      // but there is no Prisma relation — so we query InvoiceLine by sourceTable/sourceId.
      const paidStatuses = ["PAID", "SENT", "PARTIALLY_PAID"] as const;

      // Get all project time-entry ids and expense ids so we can look up their project
      const [billedTimeEntries, billedExpenses] = await Promise.all([
        ctx.db.timeEntry.findMany({
          where: {
            organizationId: ctx.orgId,
            invoiceLineId: { not: null },
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: { id: true, projectId: true, invoiceLineId: true },
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            invoiceLineId: { not: null },
            projectId: { not: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { id: true, projectId: true, invoiceLineId: true },
        }),
      ]);

      // Build lookup: invoiceLineId -> projectId
      const lineToProject = new Map<string, string>();
      for (const t of billedTimeEntries) {
        if (t.invoiceLineId) lineToProject.set(t.invoiceLineId, t.projectId);
      }
      for (const e of billedExpenses) {
        if (e.invoiceLineId && e.projectId) lineToProject.set(e.invoiceLineId, e.projectId);
      }

      // Fetch invoice lines + invoice status for those line ids
      const lineIds = Array.from(lineToProject.keys());
      const invoiceLines = lineIds.length > 0
        ? await ctx.db.invoiceLine.findMany({
            where: { id: { in: lineIds } },
            select: { id: true, total: true, invoice: { select: { status: true } } },
          })
        : [];

      // Revenue by project
      const revenueByProject: Record<string, number> = {};
      for (const line of invoiceLines) {
        if (!paidStatuses.includes(line.invoice.status as typeof paidStatuses[number])) continue;
        const pid = lineToProject.get(line.id);
        if (!pid) continue;
        revenueByProject[pid] = (revenueByProject[pid] ?? 0) + Number(line.total);
      }

      // Costs: all expenses + time entries by project
      const [allExpenses, allTime] = await Promise.all([
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            projectId: { not: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { projectId: true, rate: true, qty: true },
        }),
        ctx.db.timeEntry.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          select: {
            projectId: true,
            minutes: true,
            project: { select: { rate: true } },
          },
        }),
      ]);

      // Project names + client names
      const projects = await ctx.db.project.findMany({
        where: { organizationId: ctx.orgId },
        select: { id: true, name: true, client: { select: { name: true } } },
      });
      const projectMap = new Map(projects.map((p) => [p.id, { name: p.name, clientName: p.client.name }]));

      // Costs by project
      const costByProject: Record<string, number> = {};
      for (const e of allExpenses) {
        if (!e.projectId) continue;
        costByProject[e.projectId] = (costByProject[e.projectId] ?? 0) + Number(e.rate) * e.qty;
      }
      for (const t of allTime) {
        const hours = Number(t.minutes) / 60;
        costByProject[t.projectId] = (costByProject[t.projectId] ?? 0) + hours * Number(t.project.rate);
      }

      const allProjectIds = Array.from(
        new Set([...Object.keys(revenueByProject), ...Object.keys(costByProject)])
      );

      const rows = allProjectIds.map((pid) => {
        const info = projectMap.get(pid);
        const revenue = revenueByProject[pid] ?? 0;
        const costs = costByProject[pid] ?? 0;
        const margin = revenue - costs;
        return {
          projectId: pid,
          projectName: info?.name ?? "Unknown",
          clientName: info?.clientName ?? "Unknown",
          revenue: Math.round(revenue * 100) / 100,
          costs: Math.round(costs * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
        };
      });

      rows.sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
      const totalMargin = totalRevenue - totalCosts;

      return {
        rows,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalMargin: Math.round(totalMargin * 100) / 100,
        avgMarginPercent: totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 10000) / 100 : 0,
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
      include: { client: { select: { name: true } }, currency: { select: { id: true, code: true, symbol: true, symbolPosition: true } } },
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

      if (input.basis === "accrual") {
        // Accrual: filter by invoice date, exclude credit notes
        const lineTaxes = await ctx.db.invoiceLineTax.findMany({
          where: {
            invoiceLine: {
              invoice: {
                organizationId: ctx.orgId,
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
          organizationId: ctx.orgId,
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

  revenueForecast: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      // Calculate horizon end date
      const horizon = new Date(now);
      horizon.setUTCMonth(horizon.getUTCMonth() + input.months);

      // Step 1: Outstanding invoices (SENT + PARTIALLY_PAID)
      const openInvoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          status: { in: ["SENT", "PARTIALLY_PAID"] },
          isArchived: false,
        },
        select: {
          total: true,
          dueDate: true,
          payments: { select: { amount: true } },
        },
      });

      const outstandingByMonth: Record<string, number> = {};
      let overdueAmount = 0;

      for (const inv of openInvoices) {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Number(inv.total) - paid;
        if (remaining <= 0) continue;

        if (!inv.dueDate || inv.dueDate < now) {
          // Overdue — bucket in current month
          overdueAmount += remaining;
          outstandingByMonth[currentMonth] = (outstandingByMonth[currentMonth] ?? 0) + remaining;
        } else {
          const month = `${inv.dueDate.getUTCFullYear()}-${String(inv.dueDate.getUTCMonth() + 1).padStart(2, "0")}`;
          if (month <= `${horizon.getUTCFullYear()}-${String(horizon.getUTCMonth() + 1).padStart(2, "0")}`) {
            outstandingByMonth[month] = (outstandingByMonth[month] ?? 0) + remaining;
          }
        }
      }

      // Step 2: Recurring invoice projections
      const recurringInvoices = await ctx.db.recurringInvoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isActive: true,
        },
        select: {
          nextRunAt: true,
          frequency: true,
          interval: true,
          endDate: true,
          maxOccurrences: true,
          occurrenceCount: true,
          invoice: { select: { total: true } },
        },
      });

      const recurringByMonth: Record<string, number> = {};

      for (const rec of recurringInvoices) {
        let runAt = new Date(rec.nextRunAt);
        let count = rec.occurrenceCount;

        while (runAt <= horizon) {
          if (rec.endDate && runAt > rec.endDate) break;
          if (rec.maxOccurrences !== null && count >= rec.maxOccurrences) break;

          const month = `${runAt.getUTCFullYear()}-${String(runAt.getUTCMonth() + 1).padStart(2, "0")}`;
          recurringByMonth[month] = (recurringByMonth[month] ?? 0) + Number(rec.invoice.total);

          runAt = computeNextRunAt(runAt, rec.frequency as RecurringFrequency, rec.interval);
          count++;
        }
      }

      // Build monthly buckets
      const allMonthKeys: string[] = [];
      const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      for (let i = 0; i < input.months; i++) {
        allMonthKeys.push(
          `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
        );
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }

      const months = allMonthKeys.map((month) => {
        const outstanding = Math.round((outstandingByMonth[month] ?? 0) * 100) / 100;
        const recurring = Math.round((recurringByMonth[month] ?? 0) * 100) / 100;
        return { month, outstanding, recurring, total: Math.round((outstanding + recurring) * 100) / 100 };
      });

      const totalOutstanding = months.reduce((s, m) => s + m.outstanding, 0);
      const totalRecurring = months.reduce((s, m) => s + m.recurring, 0);

      return {
        months,
        summary: {
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          totalRecurring: Math.round(totalRecurring * 100) / 100,
          grandTotal: Math.round((totalOutstanding + totalRecurring) * 100) / 100,
          overdueAmount: Math.round(overdueAmount * 100) / 100,
        },
      };
    }),
});
