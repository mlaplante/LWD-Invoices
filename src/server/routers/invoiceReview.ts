import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import {
  reviewInvoice,
  type InvoiceReviewSnapshot,
  type RecentInvoiceSignature,
} from "@/server/services/invoice-review";
import { scanInvoiceDraft, type ScanInvoiceDraftResponse } from "@/server/services/invoice-draft-qa";
import { assertAiRateLimit } from "@/server/lib/ai-rate-limit";

const DUPLICATE_WINDOW_DAYS = 30;

export const invoiceReviewRouter = router({
  /**
   * Advisory pre-send review for one invoice. Read-only: never mutates, never
   * blocks sending. Every query is scoped to ctx.orgId so no cross-tenant data
   * can enter the snapshot or the LLM prompt.
   */
  review: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAiRateLimit("invoiceReview", ctx.orgId);
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: {
          client: true,
          lines: true,
          organization: { select: { stripeTaxEnabled: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86400000);
      const recent = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          clientId: invoice.clientId,
          id: { not: invoice.id },
          isArchived: false,
          createdAt: { gte: windowStart },
        },
        select: {
          id: true,
          number: true,
          total: true,
          createdAt: true,
          lines: { select: { name: true } },
        },
        take: 25,
      });

      // Unbilled time = TimeEntry rows for this client's projects not yet on any invoice line.
      const unbilled = await ctx.db.timeEntry.aggregate({
        _sum: { minutes: true },
        where: {
          organizationId: ctx.orgId,
          invoiceLineId: null,
          project: { clientId: invoice.clientId },
        },
      });

      const recentInvoices: RecentInvoiceSignature[] = recent.map((r) => ({
        id: r.id,
        number: r.number,
        total: Number(r.total),
        createdAt: r.createdAt,
        lineNames: r.lines.map((l) => l.name),
      }));

      const snapshot: InvoiceReviewSnapshot = {
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
        total: Number(invoice.total),
        discountTotal: Number(invoice.discountTotal),
        client: {
          id: invoice.client.id,
          name: invoice.client.name,
          address: invoice.client.address ?? null,
          city: invoice.client.city ?? null,
          country: invoice.client.country ?? null,
          taxId: invoice.client.taxId ?? null,
          isTaxExempt: invoice.client.isTaxExempt,
        },
        orgHasTaxConfigured: invoice.organization.stripeTaxEnabled,
        lines: invoice.lines.map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description ?? null,
          total: Number(l.total),
          discount: Number(l.discount),
          discountIsPercentage: l.discountIsPercentage,
        })),
        unbilledMinutes: Number(unbilled._sum.minutes ?? 0),
        recentInvoices,
      };

      const findings = await reviewInvoice(snapshot);
      return { findings };
    }),

  /**
   * Scan a draft invoice before save/send. Returns advisory findings only;
   * never auto-applies changes.
   */
  scanDraft: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({
      mode: z.enum(["create", "edit"]),
      invoiceId: z.string().optional(),
      draft: z.object({
        type: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dueDate: z.string().nullable().optional(),
        currencyId: z.string(),
        number: z.string().max(100).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        clientId: z.string().nullable().optional(),
        lines: z.array(z.object({
          clientLineId: z.string(),
          persistedLineId: z.string().nullable().optional(),
          sort: z.number().int().nonnegative(),
          lineType: z.string(),
          name: z.string().min(1).max(500),
          description: z.string().max(5000).nullable().optional(),
          qty: z.number().finite().nonnegative(),
          rate: z.number().finite().nonnegative(),
          period: z.number().nullable().optional(),
          discount: z.number().finite().nonnegative(),
          discountIsPercentage: z.boolean(),
          taxIds: z.array(z.string()),
          sourceTable: z.string().nullable().optional(),
          sourceId: z.string().nullable().optional(),
        })).max(100),
        discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
        discountAmount: z.number().finite().nonnegative().optional(),
        discountDescription: z.string().max(500).nullable().optional(),
        partialPayments: z.array(z.object({
          sortOrder: z.number().int().nonnegative(),
          amount: z.number().finite().nonnegative(),
          isPercentage: z.boolean(),
          dueDate: z.string().nullable().optional(),
          label: z.string().max(500).nullable().optional(),
        })).max(10).optional(),
      }),
      calculatedTotals: z.object({
        subtotal: z.number().finite().nonnegative(),
        discountTotal: z.number().finite().nonnegative(),
        taxTotal: z.number().finite().nonnegative(),
        total: z.number().finite().nonnegative(),
      }),
      clientContext: z.object({
        clientName: z.string().optional(),
        currencyCode: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<ScanInvoiceDraftResponse> => {
      assertAiRateLimit("invoiceReview", ctx.orgId);

      if (input.mode === "edit" && !input.invoiceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "invoiceId is required in edit mode" });
      }

      if (input.mode === "create" && input.invoiceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "invoiceId is only accepted in edit mode" });
      }

      if (input.mode === "edit") {
        const invoice = await ctx.db.invoice.findFirst({
          where: { id: input.invoiceId, organizationId: ctx.orgId },
          select: { id: true },
        });
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      if (input.draft.clientId) {
        const client = await ctx.db.client.findFirst({
          where: { id: input.draft.clientId, organizationId: ctx.orgId },
          select: { id: true },
        });
        if (!client) throw new TRPCError({ code: "BAD_REQUEST", message: "Client not found" });
      }

      const currency = await ctx.db.currency.findFirst({
        where: { id: input.draft.currencyId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!currency) throw new TRPCError({ code: "BAD_REQUEST", message: "Currency not found" });

      const requestedTaxIds = Array.from(new Set(input.draft.lines.flatMap((line) => line.taxIds)));
      if (requestedTaxIds.length > 0) {
        const taxes = await ctx.db.tax.findMany({
          where: { id: { in: requestedTaxIds }, organizationId: ctx.orgId },
          select: { id: true },
        });
        const validTaxIds = new Set(taxes.map((tax) => tax.id));
        const invalidTaxIds = requestedTaxIds.filter((id) => !validTaxIds.has(id));
        if (invalidTaxIds.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "One or more taxes are unavailable" });
        }
      }

      return scanInvoiceDraft(input, ctx);
    }),
});
