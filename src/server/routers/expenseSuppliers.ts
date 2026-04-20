import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { getExpenseSuppliersForOrg, invalidateOrg } from "../cached";

export const expenseSuppliersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getExpenseSuppliersForOrg(ctx.orgId);
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.expenseSupplier.create({
        data: { ...input, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "expenseSuppliers");
      return created;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), name: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.expenseSupplier.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.expenseSupplier.update({ where: { id }, data });
      invalidateOrg(ctx.orgId, "expenseSuppliers");
      return updated;
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expenseSupplier.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const deleted = await ctx.db.expenseSupplier.delete({ where: { id: input.id } });
      invalidateOrg(ctx.orgId, "expenseSuppliers");
      return deleted;
    }),
});
