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
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
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
