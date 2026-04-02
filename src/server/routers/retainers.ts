import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import { validateDeposit, validateDrawdown } from "../services/retainers";
import { Prisma } from "@/generated/prisma";

export const retainersRouter = router({
  /**
   * Get the retainer for a client. Creates one if it doesn't exist yet.
   * Returns the retainer with its transaction history.
   */
  getForClient: requireRole("OWNER", "ADMIN", "ACCOUNTANT", "VIEWER")
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Upsert the retainer (create if not exists)
      const retainer = await ctx.db.retainer.upsert({
        where: {
          clientId_organizationId: {
            clientId: input.clientId,
            organizationId: ctx.orgId,
          },
        },
        create: {
          clientId: input.clientId,
          organizationId: ctx.orgId,
        },
        update: {},
        include: {
          transactions: {
            orderBy: { createdAt: "desc" },
            include: {
              invoice: { select: { id: true, number: true } },
            },
          },
        },
      });

      return retainer;
    }),

  /**
   * Record a deposit into a client's retainer.
   */
  deposit: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        clientId: z.string(),
        amount: z.number().positive(),
        method: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const error = validateDeposit({
        amount: input.amount,
        method: input.method,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });

      return ctx.db.$transaction(async (tx) => {
        // Upsert retainer
        const retainer = await tx.retainer.upsert({
          where: {
            clientId_organizationId: {
              clientId: input.clientId,
              organizationId: ctx.orgId,
            },
          },
          create: {
            clientId: input.clientId,
            organizationId: ctx.orgId,
          },
          update: {},
        });

        // Create transaction
        await tx.retainerTransaction.create({
          data: {
            type: "deposit",
            amount: input.amount,
            method: input.method,
            description: input.description,
            retainerId: retainer.id,
          },
        });

        // Increment balance
        return tx.retainer.update({
          where: { id: retainer.id },
          data: {
            balance: { increment: input.amount },
          },
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
              include: {
                invoice: { select: { id: true, number: true } },
              },
            },
          },
        });
      });
    }),

  /**
   * Apply retainer funds to an invoice (drawdown).
   * Auto-marks the invoice PAID if fully covered.
   */
  applyToInvoice: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        clientId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(
        async (tx) => {
          // Fetch retainer
          const retainer = await tx.retainer.findUnique({
            where: {
              clientId_organizationId: {
                clientId: input.clientId,
                organizationId: ctx.orgId,
              },
            },
          });
          if (!retainer) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No retainer found for this client",
            });
          }

          // Fetch invoice
          const invoice = await tx.invoice.findFirst({
            where: { id: input.invoiceId, organizationId: ctx.orgId },
            include: { payments: { select: { amount: true } } },
          });
          if (!invoice) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
          }

          const totalPaid = invoice.payments.reduce(
            (s, p) => s + Number(p.amount),
            0,
          );

          const drawdownError = validateDrawdown({
            retainerBalance: Number(retainer.balance),
            invoiceTotal: Number(invoice.total),
            invoicePaid: totalPaid,
            retainerAlreadyApplied: Number(invoice.retainerApplied),
            requestedAmount: input.amount,
          });
          if (drawdownError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: drawdownError });
          }

          // Create drawdown transaction
          await tx.retainerTransaction.create({
            data: {
              type: "drawdown",
              amount: input.amount,
              description: `Applied to invoice #${invoice.number}`,
              retainerId: retainer.id,
              invoiceId: invoice.id,
            },
          });

          // Decrement retainer balance
          await tx.retainer.update({
            where: { id: retainer.id },
            data: { balance: { decrement: input.amount } },
          });

          // Update invoice retainerApplied
          const newRetainerApplied = Number(invoice.retainerApplied) + input.amount;
          const totalCovered = totalPaid + newRetainerApplied;
          const isFullyPaid = totalCovered >= Number(invoice.total);

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              retainerApplied: { increment: input.amount },
              ...(isFullyPaid ? { status: "PAID" } : {}),
            },
          });

          return { success: true, newBalance: Number(retainer.balance) - input.amount, invoiceMarkedPaid: isFullyPaid };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }),
});
