import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const DEFAULT_SUPPLIERS = [
  { name: "Amazon" },
  { name: "Apple" },
  { name: "Google" },
  { name: "Microsoft" },
  { name: "Shopify" },
  { name: "Slack" },
  { name: "Stripe" },
  { name: "Zoom" },
  { name: "Dropbox" },
  { name: "FedEx" },
  { name: "UPS" },
  { name: "USPS" },
  { name: "Staples" },
  { name: "Home Depot" },
  { name: "Other" },
];

export const expenseSuppliersRouter = router({
  ensureDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await ctx.db.expenseSupplier.count({
      where: { organizationId: ctx.orgId },
    });
    if (count > 0) return { seeded: false };
    await ctx.db.expenseSupplier.createMany({
      data: DEFAULT_SUPPLIERS.map((s) => ({ ...s, organizationId: ctx.orgId })),
    });
    return { seeded: true };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.expenseSupplier.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.expenseSupplier.create({
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
      const existing = await ctx.db.expenseSupplier.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expenseSupplier.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.expenseSupplier.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.expenseSupplier.delete({ where: { id: input.id } });
    }),
});
