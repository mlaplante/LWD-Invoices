import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().max(50).default(20),
        includeSnoozed: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      try {
        return await ctx.db.notification.findMany({
          where: {
            organizationId: org.id,
            userId: ctx.userId!,
            ...(input.includeSnoozed
              ? {}
              : { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }),
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        });
      } catch {
        return [];
      }
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    const now = new Date();
    try {
      return await ctx.db.notification.count({
        where: {
          organizationId: org.id,
          userId: ctx.userId!,
          isRead: false,
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
        },
      });
    } catch {
      return 0;
    }
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

  snooze: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        // ISO timestamp. Server clamps to [now+1min, now+30d].
        until: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const until = new Date(input.until);
      const minUntil = new Date(Date.now() + 60_000);
      const maxUntil = new Date(Date.now() + 30 * 24 * 60 * 60_000);
      if (until < minUntil || until > maxUntil) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Snooze duration must be between 1 minute and 30 days",
        });
      }
      return ctx.db.notification.updateMany({
        where: {
          id: input.id,
          organizationId: ctx.orgId,
          userId: ctx.userId!,
        },
        data: { snoozedUntil: until },
      });
    }),

  unsnooze: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.updateMany({
        where: {
          id: input.id,
          organizationId: ctx.orgId,
          userId: ctx.userId!,
        },
        data: { snoozedUntil: null },
      });
    }),
});
