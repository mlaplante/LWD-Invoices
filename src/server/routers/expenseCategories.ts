import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const DEFAULT_CATEGORIES = [
  { name: "Advertising & Marketing" },
  { name: "Bank Charges & Fees" },
  { name: "Equipment & Supplies" },
  { name: "Insurance" },
  { name: "Meals & Entertainment" },
  { name: "Office Expenses" },
  { name: "Professional Services" },
  { name: "Rent & Utilities" },
  { name: "Software & Subscriptions" },
  { name: "Travel & Transportation" },
  { name: "Wages & Payroll" },
  { name: "Taxes & Licenses" },
];

export const expenseCategoriesRouter = router({
  ensureDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await ctx.db.expenseCategory.count({
      where: { organizationId: ctx.orgId },
    });
    if (count > 0) return { seeded: false };
    await ctx.db.expenseCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, organizationId: ctx.orgId })),
    });
    return { seeded: true };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.expenseCategory.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.expenseCategory.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.expenseCategory.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expenseCategory.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expenseCategory.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expenseCategory.delete({ where: { id: input.id } });
    }),
});
