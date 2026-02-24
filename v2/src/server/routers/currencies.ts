import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

const currencySchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  symbol: z.string().min(1),
  symbolPosition: z.enum(["before", "after"]).default("before"),
  exchangeRate: z.number().positive().default(1),
  isDefault: z.boolean().default(false),
});

export const currenciesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.currency.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { code: "asc" },
    });
  }),

  create: protectedProcedure
    .input(currencySchema)
    .mutation(async ({ ctx, input }) => {
      if (input.isDefault) {
        await ctx.db.currency.updateMany({
          where: { organizationId: ctx.orgId },
          data: { isDefault: false },
        });
      }
      return ctx.db.currency.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(currencySchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.isDefault) {
        await ctx.db.currency.updateMany({
          where: { organizationId: ctx.orgId },
          data: { isDefault: false },
        });
      }
      return ctx.db.currency.update({
        where: { id, organizationId: ctx.orgId },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.currency.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),
});
