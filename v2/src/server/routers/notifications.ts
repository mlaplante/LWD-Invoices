import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.notification.findMany({
        where: { organizationId: org.id, userId: ctx.userId! },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.notification.count({
      where: {
        organizationId: org.id,
        userId: ctx.userId!,
        isRead: false,
      },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.notification.updateMany({
        where: {
          id: input.id,
          organizationId: org.id,
          userId: ctx.userId!,
        },
        data: { isRead: true },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.notification.updateMany({
      where: {
        organizationId: org.id,
        userId: ctx.userId!,
        isRead: false,
      },
      data: { isRead: true },
    });
  }),
});
