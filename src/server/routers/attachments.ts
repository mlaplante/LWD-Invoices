import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
      // Existence check only — `org.id` below is just `ctx.orgId`. See the note
      // in auditLog.ts: selecting the whole Organization row (121 columns) to
      // answer a yes/no question is pure wire and memory overhead.
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: { id: true },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.attachment.findMany({
        where: {
          organizationId: org.id,
          context: input.context,
          contextId: input.contextId,
        },
        orderBy: { createdAt: "desc" },
      });
    }),
});
