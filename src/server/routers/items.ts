import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";

const itemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rate: z.number().positive().optional(),
  unit: z.string().optional(),
});

export const itemsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.item.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
    });
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(itemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.item.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).merge(itemSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.item.update({
        where: { id, organizationId: ctx.orgId },
        data,
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.item.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),
});
