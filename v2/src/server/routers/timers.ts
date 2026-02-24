import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { roundMinutes } from "../services/time-rounding";

export const timersRouter = router({
  getActive: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.timer.findFirst({
        where: {
          taskId: input.taskId,
          organizationId: ctx.orgId,
          isOver: false,
        },
      });
    }),

  getUserTimers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.timer.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.orgId,
        isOver: false,
      },
      include: {
        task: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });
  }),

  start: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check for existing active timer
      const existing = await ctx.db.timer.findFirst({
        where: {
          taskId: input.taskId,
          organizationId: ctx.orgId,
          isOver: false,
        },
      });

      if (existing) {
        if (!existing.isPaused) {
          // Already running — no-op
          return existing;
        }
        // Paused — resume it
        return ctx.db.timer.update({
          where: { id: existing.id },
          data: { isPaused: false, lastModifiedAt: new Date() },
        });
      }

      // Create new timer
      const now = new Date();
      return ctx.db.timer.create({
        data: {
          startedAt: now,
          lastModifiedAt: now,
          currentSeconds: 0,
          isPaused: false,
          isOver: false,
          pausesJson: "[]",
          userId: ctx.userId,
          taskId: input.taskId,
          organizationId: ctx.orgId,
        },
      });
    }),

  pause: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.db.timer.findFirst({
        where: {
          taskId: input.taskId,
          organizationId: ctx.orgId,
          isOver: false,
          isPaused: false,
        },
      });
      if (!timer) throw new TRPCError({ code: "NOT_FOUND", message: "No active timer found" });

      const now = new Date();
      const elapsed = Math.floor((now.getTime() - timer.lastModifiedAt.getTime()) / 1000);
      const newCurrentSeconds = timer.currentSeconds + elapsed;

      // Append pause event to pausesJson
      const pauses = JSON.parse(timer.pausesJson) as Array<{ at: string; seconds: number }>;
      pauses.push({ at: now.toISOString(), seconds: newCurrentSeconds });

      return ctx.db.timer.update({
        where: { id: timer.id },
        data: {
          isPaused: true,
          currentSeconds: newCurrentSeconds,
          lastModifiedAt: now,
          pausesJson: JSON.stringify(pauses),
        },
      });
    }),

  resume: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.db.timer.findFirst({
        where: {
          taskId: input.taskId,
          organizationId: ctx.orgId,
          isOver: false,
          isPaused: true,
        },
      });
      if (!timer) throw new TRPCError({ code: "NOT_FOUND", message: "No paused timer found" });

      return ctx.db.timer.update({
        where: { id: timer.id },
        data: { isPaused: false, lastModifiedAt: new Date() },
      });
    }),

  stop: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.db.timer.findFirst({
        where: {
          taskId: input.taskId,
          organizationId: ctx.orgId,
          isOver: false,
        },
      });
      if (!timer) throw new TRPCError({ code: "NOT_FOUND", message: "No active timer found" });

      const now = new Date();
      const totalSeconds = timer.isPaused
        ? timer.currentSeconds
        : timer.currentSeconds + Math.floor((now.getTime() - timer.lastModifiedAt.getTime()) / 1000);

      const rawMinutes = totalSeconds / 60;

      const org = await ctx.db.organization.findFirst({
        where: { clerkId: ctx.orgId },
        select: { taskTimeInterval: true },
      });
      const roundedMinutes = roundMinutes(rawMinutes, org?.taskTimeInterval ?? 0);

      const task = await ctx.db.projectTask.findUnique({
        where: { id: input.taskId },
        select: { projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      return ctx.db.$transaction(async (tx) => {
        // Create time entry
        const entry = await tx.timeEntry.create({
          data: {
            minutes: roundedMinutes,
            date: now,
            userId: ctx.userId,
            taskId: input.taskId,
            projectId: task.projectId,
            organizationId: ctx.orgId,
          },
        });

        // Mark timer as over
        await tx.timer.update({
          where: { id: timer.id },
          data: { isOver: true, currentSeconds: totalSeconds, lastModifiedAt: now },
        });

        return entry;
      });
    }),
});
