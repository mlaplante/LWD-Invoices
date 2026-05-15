import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import { ClientCheckInTouchType } from "@/generated/prisma";
import { DEFAULT_TEMPLATES } from "../services/check-in-templates";

const touchTypeEnum = z.nativeEnum(ClientCheckInTouchType);

export const checkInTemplatesRouter = router({
  list: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    const existing = await ctx.db.checkInTemplate.findMany({
      where: { organizationId: ctx.orgId },
    });
    const byType = new Map(existing.map((t) => [t.touchType, t]));
    return (Object.keys(DEFAULT_TEMPLATES) as ClientCheckInTouchType[]).map((touchType) => {
      const t = byType.get(touchType);
      const fallback = DEFAULT_TEMPLATES[touchType];
      return {
        touchType,
        id: t?.id ?? null,
        subject: t?.subject ?? fallback.subject,
        body: t?.body ?? fallback.body,
        isCustom: !!t,
      };
    });
  }),

  upsert: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        touchType: touchTypeEnum,
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.checkInTemplate.upsert({
        where: {
          organizationId_touchType: {
            organizationId: ctx.orgId,
            touchType: input.touchType,
          },
        },
        update: { subject: input.subject, body: input.body },
        create: {
          organizationId: ctx.orgId,
          touchType: input.touchType,
          subject: input.subject,
          body: input.body,
        },
      });
    }),

  resetToDefault: requireRole("OWNER", "ADMIN")
    .input(z.object({ touchType: touchTypeEnum }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.checkInTemplate.delete({
          where: {
            organizationId_touchType: {
              organizationId: ctx.orgId,
              touchType: input.touchType,
            },
          },
        });
      } catch {
        // Already at default
        return null;
      }
    }),

  getSettings: requireRole("OWNER", "ADMIN").query(async ({ ctx }) => {
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { retentionEnabled: true, retentionEnabledAt: true },
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return org;
  }),

  setEnabled: requireRole("OWNER", "ADMIN")
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.organization.findUnique({
        where: { id: ctx.orgId },
        select: { retentionEnabledAt: true },
      });
      return ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: {
          retentionEnabled: input.enabled,
          // Set the cutoff on first enable only — never reset it on toggle,
          // so re-enabling doesn't reset history-suppression.
          retentionEnabledAt:
            input.enabled && !existing?.retentionEnabledAt ? new Date() : undefined,
        },
      });
    }),
});
