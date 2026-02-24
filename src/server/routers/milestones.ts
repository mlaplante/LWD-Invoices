import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const milestonesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.milestone.findMany({
        where: { projectId: input.projectId, organizationId: ctx.orgId },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().default("#3b82f6"),
        targetDate: z.coerce.date().optional(),
        sortOrder: z.number().int().default(0),
        isViewable: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.milestone.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        targetDate: z.coerce.date().optional(),
        sortOrder: z.number().int().optional(),
        isViewable: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.milestone.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.milestone.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Null out milestoneId on tasks that reference this milestone
      await ctx.db.projectTask.updateMany({
        where: { milestoneId: input.id, organizationId: ctx.orgId },
        data: { milestoneId: null },
      });

      return ctx.db.milestone.delete({ where: { id: input.id } });
    }),

  reorder: protectedProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.map((id, index) =>
          ctx.db.milestone.updateMany({
            where: { id, organizationId: ctx.orgId },
            data: { sortOrder: index },
          })
        )
      );
    }),
});
