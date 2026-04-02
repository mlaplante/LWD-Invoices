import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";

const taxSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isCompound: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const taxesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.tax.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
    });
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(taxSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tax.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).merge(taxSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.tax.update({
        where: { id, organizationId: ctx.orgId },
        data,
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tax.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),
});
