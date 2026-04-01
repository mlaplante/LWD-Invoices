import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { calculateLateFee } from "@/server/services/late-fees";

export const lateFeesRouter = router({
  /** List all late fee entries for a given invoice */
  listForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.lateFeeEntry.findMany({
        where: {
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Waive a late fee entry (OWNER or ADMIN only) */
  waive: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.lateFeeEntry.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.lateFeeEntry.update({
        where: { id: input.id },
        data: {
          isWaived: true,
          waivedAt: new Date(),
          waivedBy: ctx.userId,
        },
      });
    }),

  /** Manually apply a late fee to an invoice (OWNER or ADMIN only) */
  applyManual: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        invoiceId: z.string(),
        feeType: z.enum(["flat", "percentage"]),
        feeRate: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const amount = calculateLateFee(
        input.feeType,
        input.feeRate,
        Number(invoice.total),
      );
      if (amount <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Calculated fee amount is zero",
        });
      }

      return ctx.db.lateFeeEntry.create({
        data: {
          amount,
          feeType: input.feeType,
          feeRate: input.feeRate,
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
        },
      });
    }),
});
