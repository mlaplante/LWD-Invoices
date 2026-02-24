import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { InvoiceType } from "@/generated/prisma";

export function validateCreditApplication(
  applyAmount: number,
  creditRemaining: number,
  invoiceBalance: number,
): void {
  if (applyAmount > creditRemaining) {
    throw new Error(`Amount exceeds credit note remaining of ${creditRemaining}`);
  }
  if (applyAmount > invoiceBalance) {
    throw new Error(`Amount exceeds invoice balance of ${invoiceBalance}`);
  }
}

export const creditNotesRouter = router({
  listForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { clerkId: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.findMany({
        where: {
          organizationId: org.id,
          clientId: input.clientId,
          type: InvoiceType.CREDIT_NOTE,
          isArchived: false,
        },
        include: {
          creditNotesIssued: true,
          currency: true,
        },
      });
    }),

  applyToInvoice: protectedProcedure
    .input(
      z.object({
        creditNoteId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { clerkId: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const [creditNote, invoice] = await Promise.all([
        ctx.db.invoice.findFirst({
          where: {
            id: input.creditNoteId,
            organizationId: org.id,
            type: InvoiceType.CREDIT_NOTE,
          },
          include: { creditNotesIssued: true },
        }),
        ctx.db.invoice.findFirst({
          where: { id: input.invoiceId, organizationId: org.id },
          include: { payments: true, creditNotesReceived: true },
        }),
      ]);

      if (!creditNote || !invoice) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const totalApplied = creditNote.creditNotesIssued.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const creditRemaining = Number(creditNote.total) - totalApplied;

      const totalPaid = invoice.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const creditApplied = invoice.creditNotesReceived.reduce(
        (sum, a) => sum + Number(a.amount),
        0,
      );
      const invoiceBalance = Number(invoice.total) - totalPaid - creditApplied;

      try {
        validateCreditApplication(input.amount, creditRemaining, invoiceBalance);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (e as Error).message,
        });
      }

      return ctx.db.creditNoteApplication.create({
        data: {
          creditNoteId: input.creditNoteId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          organizationId: org.id,
        },
      });
    }),
});
