import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { RecurringFrequency } from "@/generated/prisma";
import { computeNextRunAt } from "@/inngest/functions/recurring-invoices";

const recurringExpenseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  qty: z.number().int().positive().default(1),
  rate: z.number(),
  reimbursable: z.boolean().default(false),
  frequency: z.nativeEnum(RecurringFrequency),
  interval: z.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  taxId: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  projectId: z.string().optional(),
});

export const recurringExpensesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.recurringExpense.findMany({
      where: { organizationId: ctx.orgId },
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
      const rec = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          tax: true,
          category: true,
          supplier: true,
          project: { select: { id: true, name: true } },
          generatedExpenses: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      return rec;
    }),

  create: protectedProcedure
    .input(recurringExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.recurringExpense.create({
        data: {
          ...input,
          organizationId: ctx.orgId,
          nextRunAt: input.startDate,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(recurringExpenseSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const scheduleChanged = data.frequency || data.interval || data.startDate;
      const updateData: any = { ...data };
      if (scheduleChanged) {
        const freq = data.frequency ?? existing.frequency;
        const intv = data.interval ?? existing.interval;
        const start = data.startDate ?? existing.startDate;
        const now = new Date();
        if (start > now) {
          updateData.nextRunAt = start;
        } else {
          let next = new Date(start);
          while (next <= now) {
            next = computeNextRunAt(next, freq, intv);
          }
          updateData.nextRunAt = next;
        }
      }

      return ctx.db.recurringExpense.update({
        where: { id, organizationId: ctx.orgId },
        data: updateData,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringExpense.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.recurringExpense.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringExpense.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isActive: !existing.isActive },
      });
    }),
});
