import { z } from "zod";
import { unstable_cache } from "next/cache";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma";
import { router, protectedProcedure, requireRole } from "../trpc";
import { logAudit } from "../services/audit";
import { orgTag, invalidateOrg } from "../cached";
import { InvoiceStatus, RecurringFrequency } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";
import { getArAgingAsOf, getDsoTrend } from "@/server/services/ar-reports";
import { summarizeUtilization, type UtilizationEntry } from "../services/utilization";
import { getClientConcentration } from "@/server/services/client-concentration";
import { getTaxLiability } from "@/server/services/tax-liability";
import { getIncomeByCategory } from "@/server/services/income-by-category";
import { getDeductibleExpenses } from "@/server/services/deductible-expenses";
import { get1099Pack } from "@/server/services/contractor-1099";
import { getEstimatedTaxSummary } from "@/server/services/estimated-tax";

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
      // Monthly rollups happen in SQL (GROUP BY month at UTC, matching the old
      // groupByMonth JS helper) so the payload is one row per month instead of
      // every payment/expense/credit row in the range.
      const monthly = (rows: Array<{ month: string; total: number }>) => {
        const result: Record<string, number> = {};
        for (const r of rows) result[r.month] = r.total;
        return result;
      };

      const [revRows, expRows, credRows, discountRows] = await Promise.all([
        ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT to_char("paidAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(amount)::float AS total
          FROM "Payment"
          WHERE "organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND "paidAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND "paidAt" <= ${input.to}` : Prisma.empty}
          GROUP BY month
        `,
        ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(rate * qty)::float AS total
          FROM "Expense"
          WHERE "organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND "createdAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND "createdAt" <= ${input.to}` : Prisma.empty}
          GROUP BY month
        `,
        ctx.db.$queryRaw<Array<{ month: string; total: number }>>`
          SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(amount)::float AS total
          FROM "CreditNoteApplication"
          WHERE "organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND "createdAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND "createdAt" <= ${input.to}` : Prisma.empty}
          GROUP BY month
        `,
        ctx.db.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM(
            CASE WHEN "discountType" = 'percentage'
              THEN subtotal * "discountAmount" / 100
              ELSE "discountAmount"
            END
          ), 0)::float AS total
          FROM "Invoice"
          WHERE "organizationId" = ${ctx.orgId}
            AND "isArchived" = false
            AND status <> ${InvoiceStatus.DRAFT}::"InvoiceStatus"
            AND "discountType" IS NOT NULL
            AND "discountAmount" > 0
            ${input.from ? Prisma.sql`AND "date" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND "date" <= ${input.to}` : Prisma.empty}
        `,
      ]);

      const revenueByMonth = monthly(revRows);
      const expensesByMonth = monthly(expRows);
      const creditsByMonth = monthly(credRows);

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

      return {
        revenueByMonth,
        expensesByMonth,
        creditsByMonth,
        netByMonth,
        totalRevenue,
        totalExpenses,
        totalCredits,
        netIncome: totalRevenue - totalExpenses - totalCredits,
        totalDiscountsGiven: Math.round((discountRows[0]?.total ?? 0) * 100) / 100,
      };
    }),

  profitabilityByClient: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      // Revenue and costs aggregate in SQL (GROUP BY clientId) so the payload
      // is one row per client instead of every payment/expense/time entry.
      const [revenueRows, expenseCostRows, timeCostRows, clients] = await Promise.all([
        // Revenue: payments grouped by invoice's clientId
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT i."clientId" AS id, SUM(p.amount)::float AS total
          FROM "Payment" p
          JOIN "Invoice" i ON i.id = p."invoiceId"
          WHERE p."organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND p."paidAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND p."paidAt" <= ${input.to}` : Prisma.empty}
          GROUP BY i."clientId"
        `,
        // Costs: expenses via project.clientId
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT pr."clientId" AS id, SUM(e.rate * e.qty)::float AS total
          FROM "Expense" e
          JOIN "Project" pr ON pr.id = e."projectId"
          WHERE e."organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND e."createdAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND e."createdAt" <= ${input.to}` : Prisma.empty}
          GROUP BY pr."clientId"
        `,
        // Costs: time entries at the project's rate
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT pr."clientId" AS id, SUM(t.minutes * pr.rate / 60.0)::float AS total
          FROM "TimeEntry" t
          JOIN "Project" pr ON pr.id = t."projectId"
          WHERE t."organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND t."date" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND t."date" <= ${input.to}` : Prisma.empty}
          GROUP BY pr."clientId"
        `,
        // Client names
        ctx.db.client.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true },
        }),
      ]);
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));

      const revenueByClient: Record<string, number> = {};
      for (const r of revenueRows) revenueByClient[r.id] = r.total;

      const costByClient: Record<string, number> = {};
      for (const r of expenseCostRows) costByClient[r.id] = (costByClient[r.id] ?? 0) + r.total;
      for (const r of timeCostRows) costByClient[r.id] = (costByClient[r.id] ?? 0) + r.total;

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
      // Revenue: invoice lines sourced from TimeEntry or Expense, on paid/sent
      // invoices. TimeEntry.invoiceLineId and Expense.invoiceLineId store the
      // InvoiceLine id without a Prisma relation, so the line→project mapping
      // is built in SQL. DISTINCT ON keeps one project per line (each line is
      // counted once), preferring the Expense mapping like the previous
      // Map-based implementation did.
      const paidStatuses: string[] = ["PAID", "SENT", "PARTIALLY_PAID"];

      const [revenueRows, expenseCostRows, timeCostRows, projects] = await Promise.all([
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT src."projectId" AS id, SUM(il.total)::float AS total
          FROM (
            SELECT DISTINCT ON ("invoiceLineId") "invoiceLineId", "projectId"
            FROM (
              SELECT "invoiceLineId", "projectId", 0 AS priority
              FROM "TimeEntry"
              WHERE "organizationId" = ${ctx.orgId}
                AND "invoiceLineId" IS NOT NULL AND "projectId" IS NOT NULL
                ${input.from ? Prisma.sql`AND "date" >= ${input.from}` : Prisma.empty}
                ${input.to ? Prisma.sql`AND "date" <= ${input.to}` : Prisma.empty}
              UNION ALL
              SELECT "invoiceLineId", "projectId", 1 AS priority
              FROM "Expense"
              WHERE "organizationId" = ${ctx.orgId}
                AND "invoiceLineId" IS NOT NULL AND "projectId" IS NOT NULL
                ${input.from ? Prisma.sql`AND "createdAt" >= ${input.from}` : Prisma.empty}
                ${input.to ? Prisma.sql`AND "createdAt" <= ${input.to}` : Prisma.empty}
            ) mapped
            ORDER BY "invoiceLineId", priority DESC
          ) src
          JOIN "InvoiceLine" il ON il.id = src."invoiceLineId"
          JOIN "Invoice" i ON i.id = il."invoiceId"
          WHERE i.status::text = ANY(${paidStatuses}::text[])
          GROUP BY src."projectId"
        `,
        // Costs: all project expenses
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT e."projectId" AS id, SUM(e.rate * e.qty)::float AS total
          FROM "Expense" e
          WHERE e."organizationId" = ${ctx.orgId}
            AND e."projectId" IS NOT NULL
            ${input.from ? Prisma.sql`AND e."createdAt" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND e."createdAt" <= ${input.to}` : Prisma.empty}
          GROUP BY e."projectId"
        `,
        // Costs: time entries at the project's rate
        ctx.db.$queryRaw<Array<{ id: string; total: number }>>`
          SELECT t."projectId" AS id, SUM(t.minutes * pr.rate / 60.0)::float AS total
          FROM "TimeEntry" t
          JOIN "Project" pr ON pr.id = t."projectId"
          WHERE t."organizationId" = ${ctx.orgId}
            ${input.from ? Prisma.sql`AND t."date" >= ${input.from}` : Prisma.empty}
            ${input.to ? Prisma.sql`AND t."date" <= ${input.to}` : Prisma.empty}
          GROUP BY t."projectId"
        `,
        // Project names + client names
        ctx.db.project.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true, client: { select: { name: true } } },
        }),
      ]);
      const projectMap = new Map(projects.map((p) => [p.id, { name: p.name, clientName: p.client.name }]));

      const revenueByProject: Record<string, number> = {};
      for (const r of revenueRows) revenueByProject[r.id] = r.total;

      const costByProject: Record<string, number> = {};
      for (const r of expenseCostRows) costByProject[r.id] = (costByProject[r.id] ?? 0) + r.total;
      for (const r of timeCostRows) costByProject[r.id] = (costByProject[r.id] ?? 0) + r.total;

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
        if (!e.projectId || !e.project) continue;
        const key = e.projectId;
        if (!byProject.has(key)) {
          byProject.set(key, {
            projectId: key,
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

  utilization: protectedProcedure
    .input(
      dateRangeSchema.extend({
        groupBy: z.enum(["week", "month"]).default("month"),
        dimension: z.enum(["client", "project", "user"]).default("project"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.from || input.to
            ? { date: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
        },
        select: {
          minutes: true, date: true, retainerId: true, userId: true,
          project: {
            select: { id: true, name: true, isFlatRate: true, rate: true, client: { select: { id: true, name: true } } },
          },
        },
      });

      // Build user display name map
      const userIds = [...new Set(entries.map((e) => e.userId).filter((id): id is string => id != null))];
      const users = userIds.length > 0
        ? await ctx.db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const nameMap = new Map(
        users.map((u) => [
          u.id,
          u.firstName
            ? `${u.firstName}${u.lastName ? " " + u.lastName : ""}`
            : (u.email ?? u.id),
        ]),
      );

      const mapped: UtilizationEntry[] = entries.map((e) => ({
        date: e.date,
        minutes: e.minutes.toNumber(),
        retainerId: e.retainerId,
        projectId: e.project?.id ?? null,
        projectName: e.project?.name ?? null,
        clientId: e.project?.client?.id ?? null,
        clientName: e.project?.client?.name ?? null,
        userId: e.userId,
        userName: e.userId ? (nameMap.get(e.userId) ?? e.userId) : null,
        project: e.project ? { isFlatRate: e.project.isFlatRate, rate: e.project.rate.toNumber() } : null,
      }));

      return summarizeUtilization(mapped, { groupBy: input.groupBy, dimension: input.dimension });
    }),

  taxLiability: protectedProcedure
    .input(
      dateRangeSchema.extend({
        basis: z.enum(["cash", "accrual"]).default("accrual"),
      })
    )
    .query(async ({ ctx, input }) => {
      return getTaxLiability(ctx.db, ctx.orgId, input);
    }),

  taxDashboard: protectedProcedure
    .input(
      dateRangeSchema.extend({
        basis: z.enum(["cash", "accrual"]).default("cash"),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1099 figures are annual; derive the tax year from the range end (or
      // start), defaulting to the current calendar year.
      const year = (input.to ?? input.from ?? new Date()).getUTCFullYear();

      const [tax, income, deductible, pack] = await Promise.all([
        getTaxLiability(ctx.db, ctx.orgId, { from: input.from, to: input.to, basis: input.basis }),
        getIncomeByCategory(ctx.db, ctx.orgId, { from: input.from, to: input.to }),
        getDeductibleExpenses(ctx.db, ctx.orgId, { from: input.from, to: input.to }),
        get1099Pack(ctx.db, ctx.orgId, year),
      ]);

      const eligibleRows = pack.rows.filter((r) => r.eligible);
      const contractorExposure = {
        year,
        threshold: pack.threshold,
        eligibleCount: eligibleRows.length,
        totalReportable: eligibleRows.reduce((s, r) => s + r.total, 0),
        missingW9Count: pack.rows.filter((r) => r.missingW9).length,
      };

      return {
        salesTaxDue: tax.grandTotal,
        salesTaxByType: tax.summary,
        grossIncome: income.total,
        incomeByCategory: income.rows,
        deductible,
        estimatedNetIncome: income.total - deductible.deductibleTotal,
        contractorExposure,
      };
    }),

  // Self-employment estimated-tax planner: net SE income (cash basis) bucketed
  // by IRS quarter with a recommended set-aside and SE-tax guidance.
  estimatedTax: protectedProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const year = input.year ?? new Date().getUTCFullYear();
      // Rendered on the dashboard on every load; TTL-cached with explicit
      // invalidation when a payment is recorded/deleted. Dates are normalized
      // to ISO strings because unstable_cache JSON-serializes.
      return unstable_cache(
        async () => {
          const org = await ctx.db.organization.findUniqueOrThrow({
            where: { id: ctx.orgId },
            select: {
              estimatedTaxEnabled: true,
              estimatedTaxSetAsidePercent: true,
              estimatedTaxReminderDays: true,
              currencies: {
                where: { isDefault: true },
                select: { symbol: true },
              },
            },
          });
          const summary = await getEstimatedTaxSummary(ctx.db, ctx.orgId, {
            year,
            setAsidePercent: Number(org.estimatedTaxSetAsidePercent),
          });
          return {
            ...summary,
            quarters: summary.quarters.map((q) => ({
              ...q,
              periodStart: q.periodStart.toISOString(),
              periodEnd: q.periodEnd.toISOString(),
              dueDate: q.dueDate.toISOString(),
            })),
            nextDue: summary.nextDue
              ? { ...summary.nextDue, dueDate: summary.nextDue.dueDate.toISOString() }
              : null,
            enabled: org.estimatedTaxEnabled,
            reminderDays: org.estimatedTaxReminderDays,
            currencySymbol: org.currencies[0]?.symbol ?? "$",
          };
        },
        ["reports:estimatedTax", ctx.orgId, String(year)],
        { tags: [orgTag(ctx.orgId, "estimated-tax")], revalidate: 60 }
      )();
    }),

  // Recorded estimated-tax payments for a tax year (drives paid vs. remaining).
  estimatedTaxPayments: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100).optional() }))
    .query(async ({ ctx, input }) => {
      const year = input.year ?? new Date().getUTCFullYear();
      const rows = await ctx.db.estimatedTaxPayment.findMany({
        where: { organizationId: ctx.orgId, year },
        orderBy: [{ quarter: "asc" }, { paidAt: "asc" }],
        select: { id: true, year: true, quarter: true, amount: true, paidAt: true, note: true },
      });
      return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
    }),

  addEstimatedTaxPayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100),
        quarter: z.number().int().min(1).max(4),
        amount: z.number().positive().max(100_000_000),
        paidAt: z.coerce.date().optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.estimatedTaxPayment.create({
        data: {
          organizationId: ctx.orgId,
          year: input.year,
          quarter: input.quarter,
          amount: input.amount,
          paidAt: input.paidAt ?? new Date(),
          note: input.note,
        },
      });
      await logAudit({
        action: "CREATED",
        entityType: "EstimatedTaxPayment",
        entityId: created.id,
        entityLabel: `Q${created.quarter} ${created.year} estimated tax payment`,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      invalidateOrg(ctx.orgId, "estimated-tax");
      return { ...created, amount: Number(created.amount) };
    }),

  deleteEstimatedTaxPayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Scope the delete to the org so one tenant can't remove another's record.
      const result = await ctx.db.estimatedTaxPayment.deleteMany({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
      }
      await logAudit({
        action: "DELETED",
        entityType: "EstimatedTaxPayment",
        entityId: input.id,
        entityLabel: "Estimated tax payment",
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      invalidateOrg(ctx.orgId, "estimated-tax");
      return { success: true };
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

      // Step 1: Outstanding invoices (SENT + PARTIALLY_PAID + OVERDUE)
      const openInvoices = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
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

  // AR aging by outstanding balance (net of payments), as of now. Unlike
  // invoiceAging above (which buckets gross invoice totals), this nets payments
  // so the numbers reconcile to the actual receivable, and powers the DSO board.
  arAging: protectedProcedure.query(async ({ ctx }) => {
    return getArAgingAsOf(ctx.db, ctx.orgId);
  }),

  // Days-Sales-Outstanding at each of the last 12 month-ends.
  dsoTrend: protectedProcedure
    .input(z.object({ months: z.number().int().min(3).max(24).default(12) }).optional())
    .query(async ({ ctx, input }) => {
      return getDsoTrend(ctx.db, ctx.orgId, input?.months ?? 12);
    }),

  clientConcentration: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      return getClientConcentration(ctx.db, ctx.orgId, input);
    }),

  // ─── Weekly Business Briefing ─────────────────────────────────────────
  weeklyBriefing: protectedProcedure
    .input(
      z.object({
        weekStart: z.coerce.date().optional(),
        weekEnd: z.coerce.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { getWeeklyBriefing } = await import("../services/weekly-briefing");

      // Use provided dates or default to last 7 days
      const weekStart = input?.weekStart ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekEnd = input?.weekEnd ?? new Date();

      void weekStart;
      void weekEnd;
      return getWeeklyBriefing(ctx.db, ctx.orgId);
    }),
});
