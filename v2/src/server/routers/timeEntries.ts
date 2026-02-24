import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { PrismaClient, LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type TaxInput,
} from "../services/tax-calculator";
import { roundMinutes } from "../services/time-rounding";

export const timeEntriesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        taskId: z.string().optional(),
        userId: z.string().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        unbilledOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.timeEntry.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.unbilledOnly ? { invoiceLineId: null } : {}),
          ...(input.dateFrom || input.dateTo
            ? {
                date: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo ? { lte: input.dateTo } : {}),
                },
              }
            : {}),
        },
        include: {
          task: { select: { id: true, name: true, rate: true } },
          project: { select: { id: true, name: true, rate: true, currency: true } },
        },
        orderBy: { date: "desc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        taskId: z.string().optional(),
        date: z.coerce.date().default(() => new Date()),
        minutes: z.number().positive(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: { taskTimeInterval: true },
      });
      const rounded = roundMinutes(input.minutes, org?.taskTimeInterval ?? 0);

      return ctx.db.timeEntry.create({
        data: {
          ...input,
          minutes: rounded,
          userId: ctx.userId,
          organizationId: ctx.orgId,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        date: z.coerce.date().optional(),
        minutes: z.number().positive().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        note: z.string().optional(),
        taskId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.timeEntry.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.timeEntry.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.timeEntry.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.invoiceLineId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a billed time entry.",
        });
      }
      return ctx.db.timeEntry.delete({ where: { id: input.id } });
    }),

  billToInvoice: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        entryIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: { lines: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const entries = await ctx.db.timeEntry.findMany({
        where: {
          id: { in: input.entryIds },
          organizationId: ctx.orgId,
          invoiceLineId: null,
        },
        include: {
          task: { select: { id: true, name: true, rate: true } },
          project: { select: { id: true, name: true, rate: true } },
        },
      });
      if (entries.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No unbilled entries found" });
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
        const createdLineIds: { entryId: string; lineId: string }[] = [];

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const rate = entry.task?.rate?.toNumber() ?? entry.project.rate.toNumber();
          const qty = entry.minutes.toNumber() / 60; // convert minutes to hours
          const lineInput = {
            qty,
            rate,
            lineType: LineType.TIME_ENTRY,
            discount: 0,
            discountIsPercentage: false,
            taxIds: [] as string[],
          };
          const result = calculateLineTotals(lineInput, []);

          const line = await txClient.invoiceLine.create({
            data: {
              sort: nextSort + i,
              lineType: LineType.TIME_ENTRY,
              name: entry.task?.name ?? entry.project.name,
              description: entry.note ?? undefined,
              qty,
              rate,
              subtotal: result.subtotal,
              taxTotal: result.taxTotal,
              total: result.total,
              sourceTable: "TimeEntry",
              sourceId: entry.id,
              invoiceId: input.invoiceId,
            },
          });

          createdLineIds.push({ entryId: entry.id, lineId: line.id });
        }

        // Mark entries as billed
        for (const { entryId, lineId } of createdLineIds) {
          await txClient.timeEntry.update({
            where: { id: entryId },
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
