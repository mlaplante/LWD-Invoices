import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const discussionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussion.findMany({
        where: { projectId: input.projectId, organizationId: org.id },
        include: { replies: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.string(), subject: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      // Verify project belongs to org
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, organizationId: org.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussion.create({
        data: {
          projectId: input.projectId,
          subject: input.subject,
          body: input.body,
          isStaff: true,
          authorId: ctx.userId,
          organizationId: org.id,
        },
        include: { replies: true },
      });
    }),

  reply: protectedProcedure
    .input(z.object({ discussionId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      // Verify discussion belongs to org
      const discussion = await ctx.db.discussion.findFirst({
        where: { id: input.discussionId, organizationId: org.id },
      });
      if (!discussion) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.discussionReply.create({
        data: {
          discussionId: input.discussionId,
          body: input.body.trim(),
          isStaff: true,
          authorId: ctx.userId,
        },
      });
    }),
});
