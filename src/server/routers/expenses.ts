import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { PrismaClient, LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type TaxInput,
} from "../services/tax-calculator";

export const expensesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1).optional(),
        unbilledOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.unbilledOnly ? { invoiceLineId: null } : {}),
        },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const expense = await ctx.db.expense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
        },
      });
      if (!expense) throw new TRPCError({ code: "NOT_FOUND" });
      return expense;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1).optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        qty: z.number().int().positive().default(1),
        rate: z.number(),
        dueDate: z.coerce.date().optional(),
        paidAt: z.coerce.date().optional(),
        reimbursable: z.boolean().default(false),
        paymentDetails: z.string().optional(),
        taxId: z.string().optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.expense.create({
        data: { ...input, organizationId: ctx.orgId },
        include: { tax: true, category: true, supplier: true, project: { select: { id: true, name: true } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        qty: z.number().int().positive().optional(),
        rate: z.number().optional(),
        dueDate: z.coerce.date().optional(),
        paymentDetails: z.string().optional(),
        taxId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        supplierId: z.string().nullable().optional(),
        paidAt: z.coerce.date().nullable().optional(),
        reimbursable: z.boolean().optional(),
        projectId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.expense.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expense.update({
        where: { id, organizationId: ctx.orgId },
        data,
        include: { tax: true, category: true, supplier: true, project: { select: { id: true, name: true } } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.invoiceLineId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a billed expense.",
        });
      }
      return ctx.db.expense.delete({ where: { id: input.id, organizationId: ctx.orgId } });
    }),

  billToInvoice: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        expenseIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: { lines: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const expenses = await ctx.db.expense.findMany({
        where: {
          id: { in: input.expenseIds },
          organizationId: ctx.orgId,
          invoiceLineId: null,
        },
        include: { tax: true },
      });
      if (expenses.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No unbilled expenses found" });
      }

      const allTaxes = await ctx.db.tax.findMany({ where: { organizationId: ctx.orgId } });
      const taxInputs: TaxInput[] = allTaxes.map((t) => ({
        id: t.id,
        rate: t.rate.toNumber(),
        isCompound: t.isCompound,
      }));

      const nextSort = invoice.lines.length;

      return ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const createdLineIds: { expenseId: string; lineId: string }[] = [];

        for (let i = 0; i < expenses.length; i++) {
          const expense = expenses[i];
          const taxIds = expense.tax ? [expense.tax.id] : [];
          const applicableTaxes = taxInputs.filter((t) => taxIds.includes(t.id));
          const lineInput = {
            qty: expense.qty,
            rate: expense.rate.toNumber(),
            lineType: LineType.EXPENSE,
            discount: 0,
            discountIsPercentage: false,
            taxIds,
          };
          const result = calculateLineTotals(lineInput, applicableTaxes);

          const line = await txClient.invoiceLine.create({
            data: {
              sort: nextSort + i,
              lineType: LineType.EXPENSE,
              name: expense.name,
              description: expense.description ?? undefined,
              qty: expense.qty,
              rate: expense.rate,
              subtotal: result.subtotal,
              taxTotal: result.taxTotal,
              total: result.total,
              sourceTable: "Expense",
              sourceId: expense.id,
              invoiceId: input.invoiceId,
              taxes: taxIds.length
                ? {
                    create: result.taxBreakdown.map((tb) => ({
                      taxId: tb.taxId,
                      taxAmount: tb.taxAmount,
                    })),
                  }
                : undefined,
            },
          });

          createdLineIds.push({ expenseId: expense.id, lineId: line.id });
        }

        // Mark expenses as billed
        for (const { expenseId, lineId } of createdLineIds) {
          await txClient.expense.update({
            where: { id: expenseId },
            data: { invoiceLineId: lineId },
          });
        }

        // Recalculate invoice totals
        const allLines = await txClient.invoiceLine.findMany({
          where: { invoiceId: input.invoiceId },
          include: { taxes: { include: { tax: true } } },
        });

        const lineInputs = allLines.map((l) => ({
          qty: l.qty.toNumber(),
          rate: l.rate.toNumber(),
          lineType: l.lineType,
          discount: l.discount.toNumber(),
          discountIsPercentage: l.discountIsPercentage,
          taxIds: l.taxes.map((t) => t.taxId),
        }));

        const totals = calculateInvoiceTotals(lineInputs, taxInputs);

        return txClient.invoice.update({
          where: { id: input.invoiceId },
          data: {
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
          },
        });
      });
    }),
});
