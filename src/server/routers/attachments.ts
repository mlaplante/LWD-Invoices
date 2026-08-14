import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { AttachmentContext } from "@/generated/prisma";

export const attachmentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        context: z.nativeEnum(AttachmentContext),
        contextId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // No org existence check — see the note in auditLog.ts. `ctx.orgId` comes
      // only from a live UserOrganization row whose foreign key guarantees the
      // Organization exists, so the lookup could never fail.
      return ctx.db.attachment.findMany({
        where: {
          organizationId: ctx.orgId,
          context: input.context,
          contextId: input.contextId,
        },
        orderBy: { createdAt: "desc" },
      });
    }),
});
