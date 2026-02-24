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
          ...(input.from ?? input.to
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
          ...(input.from ?? input.to
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
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expense.findMany({
        where: {
          organizationId: org.id,
          ...(input.from ?? input.to
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

  revenueByMonth: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { id: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const payments = await ctx.db.payment.findMany({
        where: {
          organizationId: org.id,
          ...(input.from ?? input.to
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
});
