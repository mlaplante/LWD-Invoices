import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import { getExpenseSuppliersForOrg, invalidateOrg } from "../cached";
import { getForOrg } from "../lib/get-for-org";

export const expenseSuppliersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getExpenseSuppliersForOrg(ctx.db, ctx.orgId);
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
      await getForOrg(ctx.db.expenseSupplier, id, ctx.orgId, { entityName: "Supplier" });
      const updated = await ctx.db.expenseSupplier.update({ where: { id }, data });
      invalidateOrg(ctx.orgId, "expenseSuppliers");
      return updated;
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      await getForOrg(ctx.db.expenseSupplier, input.id, ctx.orgId, { entityName: "Supplier" });
      const deleted = await ctx.db.expenseSupplier.delete({ where: { id: input.id } });
      invalidateOrg(ctx.orgId, "expenseSuppliers");
      return deleted;
    }),
});
