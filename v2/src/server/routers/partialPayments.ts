import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const partialPaymentSchema = z.object({
  sortOrder: z.number().int().default(0),
  amount: z.number().positive(),
  isPercentage: z.boolean().default(false),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const partialPaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify invoice belongs to org
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.partialPayment.findMany({
        where: { invoiceId: input.invoiceId },
        orderBy: { sortOrder: "asc" },
      });
    }),

  set: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        schedule: z.array(partialPaymentSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        // Delete unpaid partial payments, replace with new schedule
        await tx.partialPayment.deleteMany({
          where: { invoiceId: input.invoiceId, isPaid: false },
        });

        if (input.schedule.length > 0) {
          await tx.partialPayment.createMany({
            data: input.schedule.map((s) => ({
              ...s,
              invoiceId: input.invoiceId,
              organizationId: ctx.orgId,
            })),
          });
        }

        return tx.partialPayment.findMany({
          where: { invoiceId: input.invoiceId },
          orderBy: { sortOrder: "asc" },
        });
      });
    }),

  recordPayment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        paymentMethod: z.string().optional(),
        transactionId: z.string().optional(),
        gatewayFee: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const partial = await ctx.db.partialPayment.findUnique({
        where: { id: input.id },
        include: { invoice: { select: { organizationId: true } } },
      });
      if (!partial || partial.invoice.organizationId !== ctx.orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (partial.isPaid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid." });
      }

      return ctx.db.partialPayment.update({
        where: { id: input.id },
        data: {
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: input.paymentMethod,
          transactionId: input.transactionId,
          gatewayFee: input.gatewayFee,
        },
      });
    }),
});
