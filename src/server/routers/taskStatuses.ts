import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { getTaskStatusesForOrg, invalidateOrg } from "../cached";

export const taskStatusesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getTaskStatusesForOrg(ctx.orgId);
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        backgroundColor: z.string().default("#e5e7eb"),
        fontColor: z.string().default("#111827"),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.taskStatus.create({
        data: { ...input, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "taskStatuses");
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        backgroundColor: z.string().optional(),
        fontColor: z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.taskStatus.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.taskStatus.update({ where: { id }, data });
      invalidateOrg(ctx.orgId, "taskStatuses");
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.taskStatus.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const deleted = await ctx.db.taskStatus.delete({ where: { id: input.id } });
      invalidateOrg(ctx.orgId, "taskStatuses");
      return deleted;
    }),

  reorder: protectedProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.map((id, index) =>
          ctx.db.taskStatus.updateMany({
            where: { id, organizationId: ctx.orgId },
            data: { sortOrder: index },
          })
        )
      );
      invalidateOrg(ctx.orgId, "taskStatuses");
    }),
});
