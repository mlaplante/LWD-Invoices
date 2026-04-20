import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { getExpenseCategoriesForOrg, invalidateOrg } from "../cached";

export const expenseCategoriesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getExpenseCategoriesForOrg(ctx.orgId);
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.expenseCategory.create({
        data: { ...input, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "expenseCategories");
      return created;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), name: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.expenseCategory.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.expenseCategory.update({ where: { id }, data });
      invalidateOrg(ctx.orgId, "expenseCategories");
      return updated;
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expenseCategory.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const deleted = await ctx.db.expenseCategory.delete({ where: { id: input.id } });
      invalidateOrg(ctx.orgId, "expenseCategories");
      return deleted;
    }),
});
