import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const commentsRouter = router({
  list: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify invoice belongs to org
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.comment.findMany({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
        orderBy: { createdAt: "asc" },
      });
    }),

  add: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        body: z.string().min(1),
        isPrivate: z.boolean().default(false),
        authorName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.comment.create({
        data: {
          body: input.body,
          isPrivate: input.isPrivate,
          authorUserId: ctx.userId,
          authorName: input.authorName ?? null,
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { authorUserId: true },
      });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      if (comment.authorUserId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.comment.delete({ where: { id: input.id } });
    }),
});
