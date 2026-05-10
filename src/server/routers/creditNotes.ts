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
      // Fetch source invoice with lines and taxes (both legacy + Stripe shape).
      const sourceInvoice = await ctx.db.invoice.findFirst({
        where: {
          id: input.sourceInvoiceId,
          organizationId: ctx.orgId,
        },
        include: {
          lines: {
            include: {
              taxes: { include: { tax: true } },
              stripeTaxBreakdown: true,
            },
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

      // Generate credit note number
      const cnNumber = await generateCreditNoteNumber(ctx.orgId);

      // Use loose != null so undefined (in tests with partial mocks) takes
      // the legacy path same as null. Stripe-Tax invoices always set this.
      const sourceWasStripeTax = sourceInvoice.stripeTaxTransactionId != null;

      let invoiceTotals: { subtotal: number; discountTotal: number; taxTotal: number; total: number };
      let linesData: Array<{
        sort: number;
        lineType: typeof selectedLines[number]["lineType"];
        name: string;
        description: string | null;
        qty: typeof selectedLines[number]["qty"];
        rate: typeof selectedLines[number]["rate"];
        period: typeof selectedLines[number]["period"];
        discount: typeof selectedLines[number]["discount"];
        discountIsPercentage: boolean;
        subtotal: number;
        taxTotal: number;
        total: number;
        taxes: { create: { taxId: string; taxAmount: number }[] };
        stripeTaxBreakdown: {
          create: {
            jurisdictionDisplay: string;
            jurisdictionLevel: string;
            amount: number;
            taxableAmount: number;
            rateDecimal: number;
            taxType: string;
            reason: string | null;
          }[];
        };
      }>;

      if (sourceWasStripeTax) {
        // Source invoice's tax came from Stripe Tax. Don't recompute via the
        // legacy calculator (which would produce 0 since there are no
        // InvoiceLineTax rows). Snapshot the source's per-line tax totals and
        // jurisdiction breakdowns; the issuance step will reverse the original
        // Stripe Tax Transaction.
        let subtotalSum = 0;
        let taxSum = 0;
        linesData = selectedLines.map((l, idx) => {
          const subtotal = Number(l.subtotal);
          const taxTotal = Number(l.taxTotal);
          subtotalSum += subtotal;
          taxSum += taxTotal;
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
            subtotal,
            taxTotal,
            total: subtotal + taxTotal,
            taxes: { create: [] },
            stripeTaxBreakdown: {
              create: l.stripeTaxBreakdown.map((b) => ({
                jurisdictionDisplay: b.jurisdictionDisplay,
                jurisdictionLevel: b.jurisdictionLevel,
                amount: Number(b.amount),
                taxableAmount: Number(b.taxableAmount),
                rateDecimal: Number(b.rateDecimal),
                taxType: b.taxType,
                reason: b.reason,
              })),
            },
          };
        });
        invoiceTotals = {
          subtotal: subtotalSum,
          discountTotal: 0,
          taxTotal: taxSum,
          total: subtotalSum + taxSum,
        };
      } else {
        // Legacy path: recompute via the compound-tax calculator.
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

        const lineInputs: LineInput[] = selectedLines.map((l) => ({
          qty: Number(l.qty),
          rate: Number(l.rate),
          period: l.period ? Number(l.period) : null,
          lineType: l.lineType,
          discount: Number(l.discount),
          discountIsPercentage: l.discountIsPercentage,
          taxIds: l.taxes.map((t) => t.taxId),
        }));

        invoiceTotals = calculateInvoiceTotals(lineInputs, allTaxes);
        linesData = selectedLines.map((l, idx) => {
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
            stripeTaxBreakdown: { create: [] },
          };
        });
      }

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
          lines: { create: linesData },
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
        select: {
          id: true,
          number: true,
          creditNoteStatus: true,
          sourceInvoiceId: true,
          stripeTaxTransactionId: true,
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

      // If the source invoice was filed via Stripe Tax, reverse its
      // transaction so the negative tax shows in Stripe's filing reports.
      // Non-fatal: a tax-side failure does not unwind the credit-note
      // issuance — surfaced through audit/logs instead.
      if (cn.sourceInvoiceId && !cn.stripeTaxTransactionId) {
        try {
          const source = await ctx.db.invoice.findUnique({
            where: { id: cn.sourceInvoiceId },
            select: { stripeTaxTransactionId: true },
          });
          if (source?.stripeTaxTransactionId) {
            const { getStripeClientForOrg } = await import("@/server/services/stripe-client");
            const access = await getStripeClientForOrg(
              ctx.db as never,
              ctx.orgId,
            );
            if (access) {
              const { reverseStripeTaxTransaction } = await import(
                "@/server/services/stripe-tax-transaction"
              );
              const result = await reverseStripeTaxTransaction({
                db: ctx.db as never,
                stripe: access.stripe,
                creditNoteId: cn.id,
                originalTransactionId: source.stripeTaxTransactionId,
                reference: cn.number,
              });
              if (!result.transactionId && result.reason) {
                console.error("[credit-note] Stripe Tax reversal skipped:", result.reason);
              }
            }
          }
        } catch (err) {
          console.error("[credit-note] Stripe Tax reversal threw:", err);
        }
      }

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
