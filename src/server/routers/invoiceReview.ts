import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole } from "../trpc";
import {
  reviewInvoice,
  type InvoiceReviewSnapshot,
  type RecentInvoiceSignature,
} from "@/server/services/invoice-review";

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
});
