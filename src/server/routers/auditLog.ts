import { z } from "zod";
import { AuditAction } from "@/generated/prisma";
import { router, protectedProcedure } from "../trpc";

export const auditLogRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.string().optional(),        // kept for back-compat (single)
        entityTypes: z.array(z.string()).optional(),
        entityId: z.string().optional(),
        action: z.nativeEnum(AuditAction).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // No org existence check: it cannot fail. `ctx.orgId` is only ever set
      // from a live UserOrganization row (server/trpc.ts), and that row carries
      // a foreign key to Organization — Postgres will not let it reference a
      // row that isn't there. protectedProcedure has already rejected the
      // request if orgId is null. The lookup was an unconditional round trip on
      // every activity-feed load and every "Load more" to prove something the
      // schema already guarantees.
      const entityTypeFilter =
        input.entityTypes && input.entityTypes.length > 0
          ? { entityType: { in: input.entityTypes } }
          : input.entityType
            ? { entityType: input.entityType }
            : {};

      const createdAt =
        input.from || input.to
          ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
          : undefined;

      return ctx.db.auditLog.findMany({
        where: {
          organizationId: ctx.orgId,
          ...entityTypeFilter,
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.action ? { action: input.action } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      });
    }),
});
