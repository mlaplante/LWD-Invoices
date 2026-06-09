import { z } from "zod";
import { unstable_cache } from "next/cache";
import { router, protectedProcedure } from "../trpc";
import { InvoiceStatus } from "@/generated/prisma";
import { orgTag } from "../cached";
import {
  calculateCashFlowInsightMetrics,
  generateCashFlowNarrative,
} from "@/server/services/cash-flow-insights";

// Passive 60s cache on dashboard aggregates. No mutation-driven invalidation —
// invoice/payment/expense write paths fan out across many routers and the cost
// of plumbing tag-invalidation through all of them outweighs the benefit of
// real-time dashboard refresh. 60s staleness is acceptable for analytics.
const DASHBOARD_TTL = 60;
const dashTag = (orgId: string) => orgTag(orgId, "dashboard");

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

      const outstandingStatuses: InvoiceStatus[] = [
        InvoiceStatus.SENT,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.OVERDUE,
      ];

      const [
        thisMonthPaymentAgg,
        lastMonthPaymentAgg,
        outstandingRows,
        overdueRows,
        thisMonthExpensesAgg,
        lastMonthExpensesAgg,
      ] = await Promise.all([
        ctx.db.payment.aggregate({
          where: { organizationId: ctx.orgId, paidAt: { gte: thisMonthStart } },
          _sum: { amount: true },
        }),
        ctx.db.payment.aggregate({
          where: { organizationId: ctx.orgId, paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
          _sum: { amount: true },
        }),
        ctx.db.$queryRaw<Array<{ count: number; balance: number }>>`
          SELECT COUNT(*)::int AS count,
                 COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)::float AS balance
          FROM "Invoice" i
          LEFT JOIN (
            SELECT "invoiceId", SUM(amount) AS paid
            FROM "Payment"
            WHERE "organizationId" = ${ctx.orgId}
            GROUP BY "invoiceId"
          ) p ON p."invoiceId" = i.id
          WHERE i."organizationId" = ${ctx.orgId}
            AND i."isArchived" = false
            AND i.status::text = ANY(${outstandingStatuses}::text[])
        `,
        ctx.db.$queryRaw<Array<{ count: number; balance: number }>>`
          SELECT COUNT(*)::int AS count,
                 COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)::float AS balance
          FROM "Invoice" i
          LEFT JOIN (
            SELECT "invoiceId", SUM(amount) AS paid
            FROM "Payment"
            WHERE "organizationId" = ${ctx.orgId}
            GROUP BY "invoiceId"
          ) p ON p."invoiceId" = i.id
          WHERE i."organizationId" = ${ctx.orgId}
            AND i."isArchived" = false
            AND i.status = ${InvoiceStatus.OVERDUE}::"InvoiceStatus"
        `,
        ctx.db.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM(rate * qty), 0)::float AS total
          FROM "Expense"
          WHERE "organizationId" = ${ctx.orgId}
            AND "createdAt" >= ${thisMonthStart}
        `,
        ctx.db.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM(rate * qty), 0)::float AS total
          FROM "Expense"
          WHERE "organizationId" = ${ctx.orgId}
            AND "createdAt" >= ${lastMonthStart}
            AND "createdAt" <= ${lastMonthEnd}
        `,
      ]);

      const revenueThisMonth = Number(thisMonthPaymentAgg._sum.amount ?? 0);
      const revenueLastMonth = Number(lastMonthPaymentAgg._sum.amount ?? 0);
      const revenueChange =
        revenueLastMonth > 0
          ? Math.round(
              ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            )
          : null;

      const outstandingCount = outstandingRows[0]?.count ?? 0;
      const outstandingTotal = outstandingRows[0]?.balance ?? 0;
      const overdueCount = overdueRows[0]?.count ?? 0;
      const overdueTotal = overdueRows[0]?.balance ?? 0;

      const expensesThisMonth = thisMonthExpensesAgg[0]?.total ?? 0;
      const expensesLastMonth = lastMonthExpensesAgg[0]?.total ?? 0;
      const expensesChange =
        expensesLastMonth > 0
          ? Math.round(((expensesThisMonth - expensesLastMonth) / expensesLastMonth) * 100)
          : null;

      return {
        revenueThisMonth,
        revenueLastMonth,
        revenueChange,
        outstandingCount,
        outstandingTotal,
        overdueCount,
        overdueTotal,
        cashCollected: revenueThisMonth,
        expensesThisMonth,
        expensesChange,
      };
    }),

  revenueChart: protectedProcedure.query(({ ctx }) =>
    unstable_cache(
      async () => {
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
      },
      ["dashboard:revenueChart", ctx.orgId],
      { tags: [dashTag(ctx.orgId)], revalidate: DASHBOARD_TTL }
    )()
  ),

  invoiceStatusBreakdown: protectedProcedure.query(({ ctx }) =>
    unstable_cache(
      async () => {
        const groups = await ctx.db.invoice.groupBy({
          by: ["status"],
          where: { organizationId: ctx.orgId, isArchived: false },
          _count: true,
        });
        return groups.map((g) => ({ status: g.status, count: g._count }));
      },
      ["dashboard:invoiceStatusBreakdown", ctx.orgId],
      { tags: [dashTag(ctx.orgId)], revalidate: DASHBOARD_TTL }
    )()
  ),

  expensesVsRevenue: protectedProcedure.query(({ ctx }) =>
    unstable_cache(
      async () => {
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
      },
      ["dashboard:expensesVsRevenue", ctx.orgId],
      { tags: [dashTag(ctx.orgId)], revalidate: DASHBOARD_TTL }
    )()
  ),

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

  topClients: protectedProcedure.query(({ ctx }) =>
    unstable_cache(
      async () => {
        const now = new Date();
        const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

        const rows = await ctx.db.$queryRaw<
          Array<{ clientId: string; clientName: string; invoiceCount: number; total: number }>
        >`
          SELECT
            c.id AS "clientId",
            c.name AS "clientName",
            COUNT(DISTINCT p."invoiceId")::int AS "invoiceCount",
            SUM(p.amount)::float AS total
          FROM "Payment" p
          JOIN "Invoice" i ON i.id = p."invoiceId"
          JOIN "Client" c ON c.id = i."clientId"
          WHERE p."organizationId" = ${ctx.orgId}
            AND p."paidAt" >= ${thisMonthStart}
          GROUP BY c.id, c.name
          ORDER BY total DESC
          LIMIT 5
        `;
        return rows;
      },
      ["dashboard:topClients", ctx.orgId],
      { tags: [dashTag(ctx.orgId)], revalidate: DASHBOARD_TTL }
    )()
  ),

  estimateConversion: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999);

    const [thisMonth, lastMonth] = await Promise.all([
      ctx.db.invoice.groupBy({
        by: ["status"],
        where: {
          organizationId: ctx.orgId,
          type: "ESTIMATE",
          createdAt: { gte: thisMonthStart },
        },
        _count: true,
      }),
      ctx.db.invoice.groupBy({
        by: ["status"],
        where: {
          organizationId: ctx.orgId,
          type: "ESTIMATE",
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        _count: true,
      }),
    ]);

    function calc(groups: typeof thisMonth) {
      let sent = 0;
      let accepted = 0;
      for (const g of groups) {
        sent += g._count;
        if (g.status === "ACCEPTED") accepted += g._count;
      }
      return { sent, accepted, rate: sent > 0 ? Math.round((accepted / sent) * 100) : null };
    }

    return {
      thisMonth: calc(thisMonth),
      lastMonth: calc(lastMonth),
    };
  }),

  dueThisWeek: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    const invoices = await ctx.db.invoice.findMany({
      where: {
        organizationId: ctx.orgId,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        isArchived: false,
        dueDate: { gte: now, lte: endOfWeek },
      },
      select: {
        id: true,
        number: true,
        total: true,
        dueDate: true,
        status: true,
        client: { select: { name: true } },
        payments: { select: { amount: true } },
        currency: { select: { symbol: true, symbolPosition: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    return invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
      return {
        id: inv.id,
        number: inv.number,
        clientName: inv.client.name,
        total: inv.total.toNumber(),
        remaining: inv.total.toNumber() - paid,
        dueDate: inv.dueDate!.toISOString(),
        currencySymbol: inv.currency.symbol,
        symbolPosition: inv.currency.symbolPosition,
      };
    });
  }),

  agingReceivables: protectedProcedure.query(({ ctx }) =>
    unstable_cache(
      async () => {
        const now = new Date();

        const invoices = await ctx.db.invoice.findMany({
          where: {
            organizationId: ctx.orgId,
            isArchived: false,
            status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: {
            total: true,
            dueDate: true,
            payments: { select: { amount: true } },
          },
        });

        const buckets = [
          { label: "Current", min: -Infinity, max: 0, total: 0, count: 0 },
          { label: "1–30 days", min: 1, max: 30, total: 0, count: 0 },
          { label: "31–60 days", min: 31, max: 60, total: 0, count: 0 },
          { label: "61–90 days", min: 61, max: 90, total: 0, count: 0 },
          { label: "90+ days", min: 91, max: Infinity, total: 0, count: 0 },
        ];

        for (const inv of invoices) {
          const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
          const balance = Number(inv.total) - paid;
          if (balance <= 0) continue;

          const daysOverdue = inv.dueDate
            ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000)
            : 0;

          for (const bucket of buckets) {
            if (daysOverdue >= bucket.min && daysOverdue <= bucket.max) {
              bucket.total += balance;
              bucket.count++;
              break;
            }
          }
        }

        return buckets.map(({ label, total, count }) => ({ label, total, count }));
      },
      ["dashboard:agingReceivables", ctx.orgId],
      { tags: [dashTag(ctx.orgId)], revalidate: DASHBOARD_TTL }
    )()
  ),

  cashFlowInsights: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const currentQuarterStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    const previousQuarterStart = new Date(Date.UTC(currentQuarterStart.getUTCFullYear(), currentQuarterStart.getUTCMonth() - 3, 1));
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const dataStart = new Date(Math.min(previousQuarterStart.getTime(), previousMonthStart.getTime(), sixMonthsAgo.getTime()));

    const [payments, expenses, openInvoices, retainerTimeEntries] = await Promise.all([
      ctx.db.payment.findMany({
        where: {
          organizationId: ctx.orgId,
          paidAt: { gte: dataStart },
        },
        select: {
          amount: true,
          paidAt: true,
          invoice: {
            select: {
              clientId: true,
              date: true,
              dueDate: true,
              client: { select: { name: true } },
            },
          },
        },
      }),
      ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          createdAt: { gte: dataStart },
        },
        select: { rate: true, qty: true, createdAt: true },
      }),
      ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          isArchived: false,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        },
        select: {
          id: true,
          total: true,
          dueDate: true,
          status: true,
          payments: { select: { amount: true } },
          client: { select: { id: true, name: true } },
        },
      }),
      ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          retainerId: { not: null },
          invoiceLineId: null,
          date: { gte: currentMonthStart },
        },
        select: {
          minutes: true,
          invoiceLineId: true,
          retainerId: true,
          retainer: {
            select: {
              name: true,
              clientId: true,
              hourlyRate: true,
              client: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const metrics = calculateCashFlowInsightMetrics(
      { payments, expenses, openInvoices, retainerTimeEntries },
      now,
    );
    const narrative = await generateCashFlowNarrative(metrics);

    return { metrics, narrative };
  }),

  openTasks: protectedProcedure.query(async ({ ctx }) => {
    const openCount = await ctx.db.projectTask.count({
      where: { organizationId: ctx.orgId, isCompleted: false },
    });
    return { openCount };
  }),

  retainerBurn: protectedProcedure.query(async ({ ctx }) => {
    const periods = await ctx.db.hoursRetainerPeriod.findMany({
      where: { status: "ACTIVE", retainer: { is: { organizationId: ctx.orgId } } },
      select: { includedHoursSnapshot: true, timeEntries: { select: { minutes: true } } },
    });
    let includedHours = 0;
    let usedHours = 0;
    for (const p of periods) {
      includedHours += Number(p.includedHoursSnapshot);
      usedHours += p.timeEntries.reduce((sum: number, t: { minutes: unknown }) => sum + Number(t.minutes), 0) / 60;
    }
    return { includedHours, usedHours, periodCount: periods.length };
  }),
});
