import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { PrismaClient, LineType, Prisma } from "@/generated/prisma";
import { calculateLineTotals, calculateInvoiceTotals } from "../services/tax-calculator";
import { generateExpensesForRecurring } from "../services/recurring-expense-generator";
import { buildExpenseDraftFromReceipt } from "../services/expense-receipt-draft";
import { detailExpenseInclude } from "@/server/lib/expense-includes";
import { getOrgTaxList } from "@/server/lib/tax-helpers";
import { logAudit } from "../services/audit";
import { createRateLimiter } from "@/lib/rate-limit";

// Per-org throttle on the paid-LLM receipt scan. In-process (per serverless
// instance), so the effective limit is this × replicas — enough to stop a
// runaway loop from one tab racking up OpenAI spend.
const scanReceiptLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

// ~3 MB binary, base64-encoded (~4/3 expansion) plus JSON framing must stay
// under Netlify's 6 MB synchronous-function body limit. The client enforces a
// matching 3 MB file-size guard before upload.
const MAX_RECEIPT_BASE64_CHARS = 4_200_000;

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
        limit: z.number().int().min(1).max(200).default(100),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.unbilledOnly ? { invoiceLineId: null } : {}),
        },
        include: detailExpenseInclude,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | null = null;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id ?? null;
      }

      return { items, nextCursor };
    }),

  generateRecurring: protectedProcedure
    .mutation(async ({ ctx }) => {
      await generateDueExpenses(ctx.db, ctx.orgId);
      return { success: true };
    }),

  scanReceipt: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        projectId: z.string().min(1).optional(),
        fileName: z.string().min(1).max(255).optional(),
        mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]),
        dataBase64: z.string().min(1).max(MAX_RECEIPT_BASE64_CHARS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (scanReceiptLimiter.isLimited(ctx.orgId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many receipt scans. Please wait a bit and try again.",
        });
      }
      // Strip a leading data-URL prefix (e.g. "data:image/png;base64,") if the
      // client sent one; a bare base64 string passes through unchanged.
      const cleanBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
      const file = Buffer.from(cleanBase64, "base64");
      if (file.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Receipt file is empty." });
      }
      return buildExpenseDraftFromReceipt(ctx.db as unknown as PrismaClient, ctx.orgId, {
        file,
        mimeType: input.mimeType,
        fileName: input.fileName,
        projectId: input.projectId,
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const expense = await ctx.db.expense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: detailExpenseInclude,
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
      const created = await ctx.db.expense.create({
        data: {
          ...rest,
          organizationId: ctx.orgId,
          ocrRawResult: ocrRawResult !== undefined
            ? (ocrRawResult as Prisma.InputJsonValue)
            : undefined,
        },
        include: detailExpenseInclude,
      });
      await logAudit({
        action: "CREATED",
        entityType: "Expense",
        entityId: created.id,
        entityLabel: created.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return created;
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
      const updated = await ctx.db.expense.update({
        where: { id, organizationId: ctx.orgId },
        data: {
          ...rest,
          ocrRawResult: ocrRawResult !== undefined
            ? (ocrRawResult as Prisma.InputJsonValue | typeof Prisma.DbNull)
            : undefined,
        },
        include: detailExpenseInclude,
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Expense",
        entityId: updated.id,
        entityLabel: updated.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
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
      const deleted = await ctx.db.expense.delete({ where: { id: input.id, organizationId: ctx.orgId } });
      await logAudit({
        action: "DELETED",
        entityType: "Expense",
        entityId: deleted.id,
        entityLabel: deleted.name,
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return deleted;
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
      const { assertNotStripeTaxInvoice } = await import("@/server/lib/stripe-tax-guard");
      assertNotStripeTaxInvoice(invoice);

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

      const taxInputs = await getOrgTaxList(ctx.db as unknown as PrismaClient, ctx.orgId);

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
