import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import { idInput } from "../lib/schemas";
import {
  ClientCheckInOutcome,
  ClientCheckInStatus,
  ClientCheckInTouchType,
  Prisma,
} from "@/generated/prisma";
import { DEFAULT_TEMPLATES, fillTemplate } from "../services/check-in-templates";
import { getClientStatus } from "../services/client-status";

const touchTypeEnum = z.nativeEnum(ClientCheckInTouchType);
const statusEnum = z.nativeEnum(ClientCheckInStatus);
const outcomeEnum = z.nativeEnum(ClientCheckInOutcome);

export const clientCheckInsRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        status: statusEnum.optional(),
        touchType: touchTypeEnum.optional(),
        clientId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClientCheckInWhereInput = {
        organizationId: ctx.orgId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.touchType ? { touchType: input.touchType } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
      };
      return ctx.db.clientCheckIn.findMany({
        where,
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: input.limit,
        include: {
          client: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      });
    }),

  queueSummary: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    const grouped = await ctx.db.clientCheckIn.groupBy({
      by: ["touchType", "status"],
      where: { organizationId: ctx.orgId },
      _count: { _all: true },
    });
    const summary: Record<string, Record<string, number>> = {};
    for (const row of grouped) {
      summary[row.touchType] ??= {};
      summary[row.touchType][row.status] = row._count._all;
    }
    return summary;
  }),

  getDraft: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const checkIn = await ctx.db.clientCheckIn.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          client: true,
          project: { select: { id: true, name: true } },
        },
      });
      if (!checkIn) throw new TRPCError({ code: "NOT_FOUND" });

      const template = await ctx.db.checkInTemplate.findUnique({
        where: {
          organizationId_touchType: {
            organizationId: ctx.orgId,
            touchType: checkIn.touchType,
          },
        },
      });

      const fallback = DEFAULT_TEMPLATES[checkIn.touchType];
      const subjectRaw = template?.subject ?? fallback.subject;
      const bodyRaw = template?.body ?? fallback.body;

      const clientFirstName = checkIn.client.name.split(/\s+/)[0] ?? null;
      const context = {
        clientName: checkIn.client.name,
        clientFirstName,
        clientCompany: checkIn.client.name,
        projectName: checkIn.project?.name ?? null,
        senderName: null,
      };

      const status = await getClientStatus(checkIn.client.id, ctx.orgId);

      return {
        checkIn,
        clientStatus: status,
        draft: {
          subject: fillTemplate(subjectRaw, context),
          body: fillTemplate(bodyRaw, context),
        },
        usingDefault: !template,
      };
    }),

  complete: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        outcome: outcomeEnum,
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.clientCheckIn.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.clientCheckIn.update({
        where: { id: input.id },
        data: {
          status: ClientCheckInStatus.COMPLETED,
          outcome: input.outcome,
          notes: input.notes ?? existing.notes,
          completedAt: new Date(),
        },
      });
    }),

  dismiss: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.clientCheckIn.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.clientCheckIn.update({
        where: { id: input.id },
        data: {
          status: ClientCheckInStatus.DISMISSED,
          notes: input.notes ?? existing.notes,
          dismissedAt: new Date(),
        },
      });
    }),

  snooze: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), days: z.number().int().min(1).max(365) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.clientCheckIn.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const snoozedUntil = new Date(Date.now() + input.days * 86_400_000);
      return ctx.db.clientCheckIn.update({
        where: { id: input.id },
        data: { snoozedUntil, dueAt: snoozedUntil },
      });
    }),

  reopen: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.clientCheckIn.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.clientCheckIn.update({
        where: { id: input.id },
        data: {
          status: ClientCheckInStatus.PENDING,
          outcome: null,
          completedAt: null,
          dismissedAt: null,
        },
      });
    }),
});
