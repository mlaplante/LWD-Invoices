import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";

export const expenseBudgetsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.expenseBudget.findMany({
      where: { organizationId: ctx.orgId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }),

  // One budget per category (or per-org when categoryId is null). Postgres
  // unique indexes treat NULLs as distinct, so the org-wide row is deduped
  // here with a findFirst rather than relying on the @@unique constraint.
  upsert: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        categoryId: z.string().nullable(),
        monthlyAmount: z.number().min(0).max(1_000_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.categoryId) {
        const category = await ctx.db.expenseCategory.findUnique({
          where: { id: input.categoryId, organizationId: ctx.orgId },
          select: { id: true },
        });
        if (!category) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Expense category not found" });
        }
      }

      const existing = await ctx.db.expenseBudget.findFirst({
        where: { organizationId: ctx.orgId, categoryId: input.categoryId },
      });

      if (existing) {
        return ctx.db.expenseBudget.update({
          where: { id: existing.id },
          data: { monthlyAmount: input.monthlyAmount },
        });
      }
      return ctx.db.expenseBudget.create({
        data: {
          categoryId: input.categoryId,
          monthlyAmount: input.monthlyAmount,
          organizationId: ctx.orgId,
        },
      });
    }),

  delete: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expenseBudget.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expenseBudget.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),
});
