import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const organizationRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        invoicePrefix: true,
        invoiceNextNumber: true,
        taskTimeInterval: true,
      },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return org;
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        invoicePrefix: z.string().min(1).max(10).optional(),
        invoiceNextNumber: z.number().int().positive().optional(),
        taskTimeInterval: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: input,
      });
    }),
});
