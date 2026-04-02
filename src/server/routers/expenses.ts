import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { PrismaClient, LineType, Prisma } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  getOrgTaxMap,
  type TaxInput,
} from "../services/tax-calculator";
import { generateExpensesForRecurring } from "../services/recurring-expense-generator";

async function generateDueExpenses(db: PrismaClient, orgId: string) {
  const now = new Date();
  const due = await db.recurringExpense.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      nextRunAt: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
  });

  for (const rec of due) {
    try {
      await generateExpensesForRecurring(db, rec, now);
    } catch {
      // Silently skip failed records so the expense list still loads
    }
  }
}

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

  generateRecurring: protectedProcedure
    .mutation(async ({ ctx }) => {
      await generateDueExpenses(ctx.db, ctx.orgId);
      return { success: true };
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

  create: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
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
        receiptUrl: z.string().url().optional(),
        taxId: z.string().optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
        ocrRawResult: z.record(z.string(), z.unknown()).optional(),
        ocrConfidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ocrRawResult, ...rest } = input;
      return ctx.db.expense.create({
        data: {
          ...rest,
          organizationId: ctx.orgId,
          ocrRawResult: ocrRawResult !== undefined
            ? (ocrRawResult as Prisma.InputJsonValue)
            : undefined,
        },
        include: { tax: true, category: true, supplier: true, project: { select: { id: true, name: true } } },
      });
    }),

  update: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
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
        receiptUrl: z.string().url().nullable().optional(),
        ocrRawResult: z.record(z.string(), z.unknown()).nullable().optional(),
        ocrConfidence: z.number().min(0).max(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ocrRawResult, ...rest } = input;
      const existing = await ctx.db.expense.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expense.update({
        where: { id, organizationId: ctx.orgId },
        data: {
          ...rest,
          ocrRawResult: ocrRawResult !== undefined
            ? (ocrRawResult as Prisma.InputJsonValue | typeof Prisma.DbNull)
            : undefined,
        },
        include: { tax: true, category: true, supplier: true, project: { select: { id: true, name: true } } },
      });
    }),

  delete: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
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

  deleteMany: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Only delete unbilled expenses
      const deletable = await ctx.db.expense.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          invoiceLineId: null,
        },
        select: { id: true },
      });
      const deletableIds = deletable.map((e) => e.id);
      if (deletableIds.length === 0) return { count: 0 };
      return ctx.db.expense.deleteMany({
        where: { id: { in: deletableIds }, organizationId: ctx.orgId },
      });
    }),

  categorizeMany: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(100),
        categoryId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.expense.updateMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
        },
        data: { categoryId: input.categoryId },
      });
    }),

  billToInvoice: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
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

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const taxInputs: TaxInput[] = Array.from(taxMap.values());

      const nextSort = invoice.lines.length;

      return ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const createdLines = await Promise.all(
          expenses.map((expense, i) => {
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

            return txClient.invoiceLine.create({
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
          })
        );

        // Mark expenses as billed
        await Promise.all(
          createdLines.map((line, i) =>
            txClient.expense.update({
              where: { id: expenses[i].id },
              data: { invoiceLineId: line.id },
            })
          )
        );

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
