import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { PrismaClient, LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type TaxInput,
} from "../services/tax-calculator";

export const tasksRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        milestoneId: z.string().optional(),
        parentId: z.string().nullable().optional(),
        includeCompleted: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.projectTask.findMany({
        where: {
          projectId: input.projectId,
          organizationId: ctx.orgId,
          ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(!input.includeCompleted ? { isCompleted: false } : {}),
        },
        include: {
          taskStatus: true,
          milestone: true,
          timer: true,
          _count: { select: { timeEntries: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        notes: z.string().optional(),
        sortOrder: z.number().int().default(0),
        projectedHours: z.number().default(0),
        rate: z.number().default(0),
        dueDate: z.coerce.date().optional(),
        parentId: z.string().optional(),
        milestoneId: z.string().optional(),
        taskStatusId: z.string().optional(),
        assignedUserId: z.string().optional(),
        isFlatRate: z.boolean().default(false),
        isViewable: z.boolean().default(false),
        isTimesheetViewable: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.projectTask.create({
        data: { ...input, organizationId: ctx.orgId },
        include: { taskStatus: true, milestone: true },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        notes: z.string().optional(),
        sortOrder: z.number().int().optional(),
        projectedHours: z.number().optional(),
        rate: z.number().optional(),
        dueDate: z.coerce.date().optional(),
        parentId: z.string().nullable().optional(),
        milestoneId: z.string().nullable().optional(),
        taskStatusId: z.string().nullable().optional(),
        assignedUserId: z.string().nullable().optional(),
        isFlatRate: z.boolean().optional(),
        isViewable: z.boolean().optional(),
        isTimesheetViewable: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.projectTask.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.projectTask.update({
        where: { id, organizationId: ctx.orgId },
        data,
        include: { taskStatus: true, milestone: true },
      });
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.string(), isCompleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.projectTask.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.projectTask.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isCompleted: input.isCompleted },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.projectTask.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.projectTask.delete({ where: { id: input.id, organizationId: ctx.orgId } });
    }),

  reorder: protectedProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.map((id, index) =>
          ctx.db.projectTask.updateMany({
            where: { id, organizationId: ctx.orgId },
            data: { sortOrder: index },
          })
        )
      );
    }),

  billToInvoice: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        taskIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: {
          lines: { include: { taxes: true } },
          currency: true,
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const tasks = await ctx.db.projectTask.findMany({
        where: {
          id: { in: input.taskIds },
          organizationId: ctx.orgId,
          invoiceLineId: null,
        },
      });
      if (tasks.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No unbilled tasks found" });
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
        const createdLines = await Promise.all(
          tasks.map((task, i) => {
            const lineInput = {
              qty: task.projectedHours,
              rate: task.rate.toNumber(),
              lineType: LineType.TIME_ENTRY,
              discount: 0,
              discountIsPercentage: false,
              taxIds: [] as string[],
            };
            const result = calculateLineTotals(lineInput, []);

            return txClient.invoiceLine.create({
              data: {
                sort: nextSort + i,
                lineType: LineType.TIME_ENTRY,
                name: task.name,
                qty: task.projectedHours,
                rate: task.rate,
                subtotal: result.subtotal,
                taxTotal: result.taxTotal,
                total: result.total,
                sourceTable: "ProjectTask",
                sourceId: task.id,
                invoiceId: input.invoiceId,
              },
            });
          })
        );

        // Mark tasks as billed
        await Promise.all(
          createdLines.map((line, i) =>
            txClient.projectTask.update({
              where: { id: tasks[i].id },
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
