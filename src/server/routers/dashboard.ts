import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";
import { groupByMonth } from "./reports";

export const dashboardRouter = router({
  summary: protectedProcedure
    .input(
      z
        .object({
          range: z.enum(["month", "quarter", "year"]).default("month"),
        })
        .optional()
    )
    .query(async ({ ctx }) => {
      const now = new Date();
      const thisMonthStart = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      );
      const lastMonthStart = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth() - 1,
        1
      );
      const lastMonthEnd = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        0,
        23,
        59,
        59,
        999
      );

      const [
        thisMonthPayments,
        lastMonthPayments,
        outstandingInvoices,
        overdueInvoices,
        thisMonthExpenses,
      ] = await Promise.all([
        ctx.db.payment.findMany({
          where: {
            organizationId: ctx.orgId,
            paidAt: { gte: thisMonthStart },
          },
          select: { amount: true },
        }),
        ctx.db.payment.findMany({
          where: {
            organizationId: ctx.orgId,
            paidAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
          select: { amount: true },
        }),
        ctx.db.invoice.findMany({
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
          },
          select: { total: true },
        }),
        ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            status: InvoiceStatus.OVERDUE,
          },
          select: { total: true },
        }),
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            createdAt: { gte: thisMonthStart },
          },
          select: { rate: true, qty: true },
        }),
      ]);

      const revenueThisMonth = thisMonthPayments.reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      const revenueLastMonth = lastMonthPayments.reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      const revenueChange =
        revenueLastMonth > 0
          ? Math.round(
              ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            )
          : null;

      const outstandingTotal = outstandingInvoices.reduce(
        (s, inv) => s + Number(inv.total),
        0
      );
      const overdueTotal = overdueInvoices.reduce(
        (s, inv) => s + Number(inv.total),
        0
      );
      const expensesThisMonth = thisMonthExpenses.reduce(
        (s, e) => s + Number(e.rate) * e.qty,
        0
      );

      return {
        revenueThisMonth,
        revenueLastMonth,
        revenueChange,
        outstandingCount: outstandingInvoices.length,
        outstandingTotal,
        overdueCount: overdueInvoices.length,
        overdueTotal,
        cashCollected: revenueThisMonth,
        expensesThisMonth,
      };
    }),

  revenueChart: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twelveMonthsAgo = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() - 11,
      1
    );

    const payments = await ctx.db.payment.findMany({
      where: {
        organizationId: ctx.orgId,
        paidAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, paidAt: true },
    });

    const grouped = groupByMonth(
      payments,
      (p) => p.paidAt,
      (p) => Number(p.amount)
    );

    // Build 12-month array
    const result: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      result.push({ month: label, revenue: grouped[key] ?? 0 });
    }

    return result;
  }),

  invoiceStatusBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const invoices = await ctx.db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        isArchived: false,
      },
      select: { status: true },
    });

    const counts: Record<string, number> = {};
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    }

    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
    }));
  }),

  expensesVsRevenue: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const sixMonthsAgo = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() - 5,
      1
    );

    const [payments, expenses] = await Promise.all([
      ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          paidAt: { gte: sixMonthsAgo },
        },
        select: { amount: true, paidAt: true },
      }),
      ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          createdAt: { gte: sixMonthsAgo },
        },
        select: { rate: true, qty: true, createdAt: true },
      }),
    ]);

    const revenueByMonth = groupByMonth(
      payments,
      (p) => p.paidAt,
      (p) => Number(p.amount)
    );
    const expensesByMonth = groupByMonth(
      expenses,
      (e) => e.createdAt,
      (e) => Number(e.rate) * e.qty
    );

    const result: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      result.push({
        month: label,
        revenue: revenueByMonth[key] ?? 0,
        expenses: expensesByMonth[key] ?? 0,
      });
    }

    return result;
  }),

  activityFeed: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.auditLog.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityLabel: true,
      },
    });
  }),
});
