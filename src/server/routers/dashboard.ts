import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";

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

      const outstandingWhere = {
        organizationId: ctx.orgId,
        isArchived: false,
        status: {
          in: [
            InvoiceStatus.SENT,
            InvoiceStatus.PARTIALLY_PAID,
            InvoiceStatus.OVERDUE,
          ],
        },
      };
      const overdueWhere = {
        organizationId: ctx.orgId,
        isArchived: false,
        status: InvoiceStatus.OVERDUE,
      };

      const [
        thisMonthPaymentAgg,
        lastMonthPaymentAgg,
        outstandingAgg,
        overdueAgg,
        thisMonthExpenses,
      ] = await Promise.all([
        ctx.db.payment.aggregate({
          where: { organizationId: ctx.orgId, paidAt: { gte: thisMonthStart } },
          _sum: { amount: true },
        }),
        ctx.db.payment.aggregate({
          where: { organizationId: ctx.orgId, paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
          _sum: { amount: true },
        }),
        ctx.db.invoice.aggregate({
          where: outstandingWhere,
          _sum: { total: true },
          _count: true,
        }),
        ctx.db.invoice.aggregate({
          where: overdueWhere,
          _sum: { total: true },
          _count: true,
        }),
        // Expenses need rate * qty per row — can't aggregate in SQL via Prisma
        ctx.db.expense.findMany({
          where: {
            organizationId: ctx.orgId,
            createdAt: { gte: thisMonthStart },
          },
          select: { rate: true, qty: true },
        }),
      ]);

      const revenueThisMonth = Number(thisMonthPaymentAgg._sum.amount ?? 0);
      const revenueLastMonth = Number(lastMonthPaymentAgg._sum.amount ?? 0);
      const revenueChange =
        revenueLastMonth > 0
          ? Math.round(
              ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            )
          : null;

      const outstandingTotal = Number(outstandingAgg._sum.total ?? 0);
      const overdueTotal = Number(overdueAgg._sum.total ?? 0);
      const expensesThisMonth = thisMonthExpenses.reduce(
        (s, e) => s + Number(e.rate) * e.qty,
        0
      );

      return {
        revenueThisMonth,
        revenueLastMonth,
        revenueChange,
        outstandingCount: outstandingAgg._count,
        outstandingTotal,
        overdueCount: overdueAgg._count,
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

    const rows = await ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
      SELECT to_char("paidAt", 'YYYY-MM') AS month, SUM(amount)::float AS total
      FROM "Payment"
      WHERE "organizationId" = ${ctx.orgId} AND "paidAt" >= ${twelveMonthsAgo}
      GROUP BY month ORDER BY month
    `;
    const grouped: Record<string, number> = {};
    for (const r of rows) grouped[r.month] = r.total;

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
    const groups = await ctx.db.invoice.groupBy({
      by: ["status"],
      where: {
        organizationId: ctx.orgId,
        isArchived: false,
      },
      _count: true,
    });

    return groups.map((g) => ({
      status: g.status,
      count: g._count,
    }));
  }),

  expensesVsRevenue: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const sixMonthsAgo = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() - 5,
      1
    );

    const [revRows, expRows] = await Promise.all([
      ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT to_char("paidAt", 'YYYY-MM') AS month, SUM(amount)::float AS total
        FROM "Payment"
        WHERE "organizationId" = ${ctx.orgId} AND "paidAt" >= ${sixMonthsAgo}
        GROUP BY month ORDER BY month
      `,
      ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT to_char("createdAt", 'YYYY-MM') AS month, SUM(rate * qty)::float AS total
        FROM "Expense"
        WHERE "organizationId" = ${ctx.orgId} AND "createdAt" >= ${sixMonthsAgo}
        GROUP BY month ORDER BY month
      `,
    ]);

    const revenueByMonth: Record<string, number> = {};
    for (const r of revRows) revenueByMonth[r.month] = r.total;
    const expensesByMonth: Record<string, number> = {};
    for (const r of expRows) expensesByMonth[r.month] = r.total;

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
