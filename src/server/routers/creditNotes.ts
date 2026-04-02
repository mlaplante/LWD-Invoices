import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { InvoiceType, InvoiceStatus } from "@/generated/prisma";
import { generateCreditNoteNumber } from "../services/credit-note-numbering";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type LineInput,
  type TaxInput,
} from "../services/tax-calculator";
import { logAudit } from "../services/audit";

export function validateCreditApplication(
  applyAmount: number,
  creditRemaining: number,
  invoiceBalance: number,
): void {
  if (creditRemaining <= 0) {
    throw new Error("Credit note has no remaining balance");
  }
  if (invoiceBalance <= 0) {
    throw new Error("Invoice has no outstanding balance");
  }
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
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          clientId: input.clientId,
          type: InvoiceType.CREDIT_NOTE,
          isArchived: false,
        },
        include: {
          creditNotesIssued: true,
          currency: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const creditNote = await ctx.db.invoice.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.orgId,
          type: InvoiceType.CREDIT_NOTE,
        },
        include: {
          lines: { include: { taxes: { include: { tax: true } } }, orderBy: { sort: "asc" } },
          client: true,
          currency: true,
          organization: true,
          creditNotesIssued: {
            include: {
              invoice: { select: { id: true, number: true, total: true } },
            },
          },
        },
      });
      if (!creditNote) throw new TRPCError({ code: "NOT_FOUND" });
      return creditNote;
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        sourceInvoiceId: z.string(),
        lineIds: z.array(z.string()).min(1),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch source invoice with lines and taxes
      const sourceInvoice = await ctx.db.invoice.findFirst({
        where: {
          id: input.sourceInvoiceId,
          organizationId: ctx.orgId,
        },
        include: {
          lines: {
            include: { taxes: { include: { tax: true } } },
            orderBy: { sort: "asc" },
          },
          currency: true,
        },
      });

      if (!sourceInvoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source invoice not found" });
      }

      if (sourceInvoice.type === InvoiceType.CREDIT_NOTE) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create credit note from a credit note" });
      }

      // Filter to selected lines
      const selectedLines = sourceInvoice.lines.filter((l) =>
        input.lineIds.includes(l.id),
      );

      if (selectedLines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid lines selected" });
      }

      // Build all tax inputs from selected lines
      const allTaxMap = new Map<string, TaxInput>();
      for (const line of selectedLines) {
        for (const lt of line.taxes) {
          if (!allTaxMap.has(lt.taxId)) {
            allTaxMap.set(lt.taxId, {
              id: lt.taxId,
              rate: Number(lt.tax.rate),
              isCompound: lt.tax.isCompound,
            });
          }
        }
      }
      const allTaxes = Array.from(allTaxMap.values());

      // Build line inputs and calculate totals
      const lineInputs: LineInput[] = selectedLines.map((l) => ({
        qty: Number(l.qty),
        rate: Number(l.rate),
        period: l.period ? Number(l.period) : null,
        lineType: l.lineType,
        discount: Number(l.discount),
        discountIsPercentage: l.discountIsPercentage,
        taxIds: l.taxes.map((t) => t.taxId),
      }));

      const invoiceTotals = calculateInvoiceTotals(lineInputs, allTaxes);

      // Generate credit note number
      const cnNumber = await generateCreditNoteNumber(ctx.orgId);

      // Create the credit note invoice
      const creditNote = await ctx.db.invoice.create({
        data: {
          number: cnNumber,
          type: InvoiceType.CREDIT_NOTE,
          status: InvoiceStatus.DRAFT,
          creditNoteStatus: "DRAFT",
          sourceInvoiceId: input.sourceInvoiceId,
          date: new Date(),
          subtotal: invoiceTotals.subtotal,
          discountTotal: invoiceTotals.discountTotal,
          taxTotal: invoiceTotals.taxTotal,
          total: invoiceTotals.total,
          currencyId: sourceInvoice.currencyId,
          exchangeRate: sourceInvoice.exchangeRate,
          notes: input.notes ?? null,
          clientId: sourceInvoice.clientId,
          organizationId: ctx.orgId,
          lines: {
            create: selectedLines.map((l, idx) => {
              const lineResult = calculateLineTotals(
                lineInputs[idx],
                allTaxes.filter((t) => lineInputs[idx].taxIds.includes(t.id)),
              );
              return {
                sort: idx,
                lineType: l.lineType,
                name: l.name,
                description: l.description,
                qty: l.qty,
                rate: l.rate,
                period: l.period,
                discount: l.discount,
                discountIsPercentage: l.discountIsPercentage,
                subtotal: lineResult.subtotal,
                taxTotal: lineResult.taxTotal,
                total: lineResult.total,
                taxes: {
                  create: lineResult.taxBreakdown.map((tb) => ({
                    taxId: tb.taxId,
                    taxAmount: tb.taxAmount,
                  })),
                },
              };
            }),
          },
        },
        include: { lines: true },
      });

      await logAudit({
        action: "CREATED",
        entityType: "CreditNote",
        entityId: creditNote.id,
        entityLabel: cnNumber,
        diff: { sourceInvoiceId: input.sourceInvoiceId, lineCount: selectedLines.length },
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      });

      return creditNote;
    }),

  issue: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cn = await ctx.db.invoice.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.orgId,
          type: InvoiceType.CREDIT_NOTE,
        },
      });

      if (!cn) throw new TRPCError({ code: "NOT_FOUND" });

      if (cn.creditNoteStatus !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot issue a credit note with status ${cn.creditNoteStatus}`,
        });
      }

      const updated = await ctx.db.invoice.update({
        where: { id: cn.id },
        data: {
          creditNoteStatus: "ISSUED",
          status: InvoiceStatus.SENT,
        },
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "CreditNote",
        entityId: cn.id,
        entityLabel: cn.number,
        diff: { from: "DRAFT", to: "ISSUED" },
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      });

      return updated;
    }),

  void: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cn = await ctx.db.invoice.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.orgId,
          type: InvoiceType.CREDIT_NOTE,
        },
        include: { creditNotesIssued: true },
      });

      if (!cn) throw new TRPCError({ code: "NOT_FOUND" });

      if (cn.creditNoteStatus === "APPLIED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot void a credit note that has been applied",
        });
      }

      if (cn.creditNoteStatus === "VOIDED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Credit note is already voided",
        });
      }

      // Check if any applications exist
      if (cn.creditNotesIssued.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot void a credit note with existing applications",
        });
      }

      const updated = await ctx.db.invoice.update({
        where: { id: cn.id },
        data: { creditNoteStatus: "VOIDED" },
      });

      await logAudit({
        action: "STATUS_CHANGED",
        entityType: "CreditNote",
        entityId: cn.id,
        entityLabel: cn.number,
        diff: { from: cn.creditNoteStatus, to: "VOIDED" },
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      });

      return updated;
    }),

  applyToInvoice: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        creditNoteId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [creditNote, invoice] = await Promise.all([
        ctx.db.invoice.findFirst({
          where: {
            id: input.creditNoteId,
            organizationId: ctx.orgId,
            type: InvoiceType.CREDIT_NOTE,
          },
          include: { creditNotesIssued: true },
        }),
        ctx.db.invoice.findFirst({
          where: { id: input.invoiceId, organizationId: ctx.orgId },
          include: { payments: true, creditNotesReceived: true },
        }),
      ]);

      if (!creditNote || !invoice) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Must be ISSUED to apply
      if (creditNote.creditNoteStatus !== "ISSUED" && creditNote.creditNoteStatus !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Credit note status is ${creditNote.creditNoteStatus}, cannot apply`,
        });
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

      const application = await ctx.db.creditNoteApplication.create({
        data: {
          creditNoteId: input.creditNoteId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          organizationId: ctx.orgId,
        },
      });

      // Check if credit note is now fully applied
      const newTotalApplied = totalApplied + input.amount;
      if (newTotalApplied >= Number(creditNote.total)) {
        await ctx.db.invoice.update({
          where: { id: creditNote.id },
          data: { creditNoteStatus: "APPLIED" },
        });
      }

      // Check if invoice is now fully paid
      const newInvoiceBalance = invoiceBalance - input.amount;
      if (newInvoiceBalance <= 0) {
        await ctx.db.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.PAID },
        });
      }

      await logAudit({
        action: "PAYMENT_RECEIVED",
        entityType: "CreditNoteApplication",
        entityId: application.id,
        entityLabel: `${creditNote.number} -> ${invoice.number}`,
        diff: { amount: input.amount, creditNoteId: input.creditNoteId, invoiceId: input.invoiceId },
        userId: ctx.userId ?? undefined,
        organizationId: ctx.orgId,
      });

      return application;
    }),
});
