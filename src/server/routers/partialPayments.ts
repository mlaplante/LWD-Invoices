import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { logAudit } from "../services/audit";

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

  set: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        invoiceId: z.string(),
        schedule: z.array(partialPaymentSchema),
        installmentAutoChargeEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        if (input.installmentAutoChargeEnabled !== undefined) {
          await tx.invoice.update({ where: { id: input.invoiceId }, data: { installmentAutoChargeEnabled: input.installmentAutoChargeEnabled } });
        }
        // Delete unpaid partial payments, replace with new schedule
        await tx.partialPayment.deleteMany({
          where: { invoiceId: input.invoiceId, isPaid: false, organizationId: ctx.orgId },
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

  recordPayment: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
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

      const updated = await ctx.db.partialPayment.update({
        where: { id: input.id },
        data: {
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: input.paymentMethod,
          transactionId: input.transactionId,
          gatewayFee: input.gatewayFee,
        },
      });
      await logAudit({
        action: "PAYMENT_RECEIVED",
        entityType: "PartialPayment",
        entityId: input.id,
        diff: {
          method: input.paymentMethod,
          transactionId: input.transactionId,
          gatewayFee: input.gatewayFee,
        },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
    }),
});
