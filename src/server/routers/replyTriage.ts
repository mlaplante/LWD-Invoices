import { z } from "zod";
import { TriageCategory } from "@/generated/prisma";
import { protectedProcedure, requireRole, router } from "../trpc";
import { logAudit } from "../services/audit";

export const replyTriageRouter = router({
  list: protectedProcedure.input(z.object({ category: z.array(z.nativeEnum(TriageCategory)).optional(), includeDismissed: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(50) })).query(({ ctx, input }) => ctx.db.inboundEmailTriage.findMany({
    where: { organizationId: ctx.orgId, ...(input.category?.length ? { category: { in: input.category } } : {}), ...(input.includeDismissed ? {} : { isDismissed: false }) },
    include: { inboundEmail: { include: { invoice: { select: { id: true, number: true, client: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" }, take: input.limit,
  })),
  dismiss: requireRole("OWNER", "ADMIN").input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.inboundEmailTriage.updateMany({ where: { id: input.id, organizationId: ctx.orgId }, data: { isDismissed: true } });
    await logAudit({ action: "UPDATED", entityType: "InboundEmailTriage", entityId: input.id, diff: { isDismissed: true }, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {}); return row;
  }),
  undismiss: requireRole("OWNER", "ADMIN").input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.inboundEmailTriage.updateMany({ where: { id: input.id, organizationId: ctx.orgId }, data: { isDismissed: false } });
    await logAudit({ action: "UPDATED", entityType: "InboundEmailTriage", entityId: input.id, diff: { isDismissed: false }, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {}); return row;
  }),
  recategorize: requireRole("OWNER", "ADMIN").input(z.object({ id: z.string(), category: z.nativeEnum(TriageCategory) })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.inboundEmailTriage.updateMany({ where: { id: input.id, organizationId: ctx.orgId }, data: { category: input.category, source: "manual", confidence: 1, reasoning: "Set manually" } });
    await logAudit({ action: "UPDATED", entityType: "InboundEmailTriage", entityId: input.id, diff: { category: input.category, source: "manual" }, userId: ctx.userId, organizationId: ctx.orgId }).catch(() => {}); return row;
  }),
});
