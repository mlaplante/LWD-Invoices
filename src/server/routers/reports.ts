import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";

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
      const [payments, expenses] = await Promise.all([
        ctx.db.payment.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(input.from || input.to
              ? { paidAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
              : {}),
          },
          select: { amount: true, paidAt: true },
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            ...(input.from || input.to
              ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
              : {}),
          },
          select: { rate: true, qty: true, createdAt: true },
        }),
      ]);

      const revenueByMonth = groupByMonth(payments, (p) => p.paidAt, (p) => Number(p.amount));
      const expensesByMonth = groupByMonth(
        expenses,
        (e) => e.createdAt,
        (e) => Number(e.rate) * e.qty,
      );

      const allMonths = Array.from(new Set([...Object.keys(revenueByMonth), ...Object.keys(expensesByMonth)])).sort();
      const netByMonth: Record<string, number> = {};
      for (const m of allMonths) {
        netByMonth[m] = (revenueByMonth[m] ?? 0) - (expensesByMonth[m] ?? 0);
      }

      const totalRevenue = Object.values(revenueByMonth).reduce((s, v) => s + v, 0);
      const totalExpenses = Object.values(expensesByMonth).reduce((s, v) => s + v, 0);

      return {
        revenueByMonth,
        expensesByMonth,
        netByMonth,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
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

  expenseCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.expenseCategory.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }),
});
