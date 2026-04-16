import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const hoursRetainersRouter = router({
  list: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.hoursRetainer.findMany({
        where: { organizationId: ctx.orgId, clientId: input.clientId },
        include: {
          periods: {
            orderBy: { periodStart: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const retainer = await ctx.db.hoursRetainer.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          client: { select: { id: true, name: true } },
          periods: { orderBy: { periodStart: "desc" } },
          timeEntries: {
            orderBy: { date: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });
      if (!retainer) throw new TRPCError({ code: "NOT_FOUND" });
      return retainer;
    }),
});
