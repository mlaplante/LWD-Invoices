import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { PrismaClient, InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  type TaxInput,
  type LineInput,
} from "../services/tax-calculator";
import { generateInvoiceNumber } from "../services/invoice-numbering";
import { logAudit } from "../services/audit";
import { notifyOrgAdmins } from "../services/notifications";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { headers } from "next/headers";

// ─── Input Schemas ─────────────────────────────────────────────────────────────

const lineSchema = z.object({
  sort: z.number().int().default(0),
  lineType: z.nativeEnum(LineType).default(LineType.STANDARD),
  name: z.string().min(1),
  description: z.string().optional(),
  qty: z.number().default(1),
  rate: z.number().default(0),
  period: z.number().optional(),
  discount: z.number().default(0),
  discountIsPercentage: z.boolean().default(false),
  sourceTable: z.string().optional(),
  sourceId: z.string().optional(),
  taxIds: z.array(z.string()).default([]),
});

const invoiceWriteSchema = z.object({
  type: z.nativeEnum(InvoiceType).default(InvoiceType.DETAILED),
  date: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().optional(),
  currencyId: z.string().min(1),
  exchangeRate: z.number().default(1),
  simpleAmount: z.number().optional(),
  notes: z.string().optional(),
  clientId: z.string().min(1),
  lines: z.array(lineSchema).default([]),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toLineInput(line: z.infer<typeof lineSchema>): LineInput {
  return {
    qty: line.qty,
    rate: line.rate,
    period: line.period,
    lineType: line.lineType,
    discount: line.discount,
    discountIsPercentage: line.discountIsPercentage,
    taxIds: line.taxIds,
  };
}

function buildTaxInputs(taxMap: Map<string, TaxInput>, taxIds: string[]): TaxInput[] {
  return taxIds.flatMap((id) => {
    const t = taxMap.get(id);
    return t ? [t] : [];
  });
}

async function getOrgTaxMap(db: PrismaClient, orgId: string): Promise<Map<string, TaxInput>> {
  const taxes = await db.tax.findMany({ where: { organizationId: orgId } });
  return new Map(
    taxes.map((t) => [t.id, { id: t.id, rate: t.rate.toNumber(), isCompound: t.isCompound }])
  );
}

// Full include for get/detail queries
const fullInvoiceInclude = {
  client: true,
  currency: true,
  organization: true,
  lines: {
    include: {
      taxes: { include: { tax: true } },
    },
    orderBy: { sort: "asc" as const },
  },
  payments: { orderBy: { paidAt: "asc" as const } },
  partialPayments: { orderBy: { sortOrder: "asc" as const } },
};

// Summary include for list queries
const summaryInvoiceInclude = {
  client: { select: { id: true, name: true } },
  currency: { select: { id: true, symbol: true, symbolPosition: true } },
};

// ─── Router ────────────────────────────────────────────────────────────────────

export const invoicesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.array(z.nativeEnum(InvoiceStatus)).optional(),
        type: z.nativeEnum(InvoiceType).optional(),
        clientId: z.string().optional(),
        includeArchived: z.boolean().default(false),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.status?.length ? { status: { in: input.status } } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.includeArchived ? {} : { isArchived: false }),
          ...(input.dateFrom || input.dateTo
            ? {
                date: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo ? { lte: input.dateTo } : {}),
                },
              }
            : {}),
        },
        include: summaryInvoiceInclude,
        orderBy: { date: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: fullInvoiceInclude,
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      return invoice;
    }),

  create: protectedProcedure
    .input(invoiceWriteSchema)
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);

      const invoice = await ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);

        const lineResults = input.lines.map((line) => {
          const lineTaxes = buildTaxInputs(taxMap, line.taxIds);
          const result = calculateLineTotals(toLineInput(line), lineTaxes);
          return { line, result };
        });

        const invoiceTotals = calculateInvoiceTotals(
          input.lines.map(toLineInput),
          [...taxMap.values()]
        );

        return tx.invoice.create({
          data: {
            number,
            type: input.type,
            status: InvoiceStatus.DRAFT,
            date: input.date,
            dueDate: input.dueDate,
            currencyId: input.currencyId,
            exchangeRate: input.exchangeRate,
            simpleAmount: input.simpleAmount,
            notes: input.notes,
            clientId: input.clientId,
            organizationId: ctx.orgId,
            subtotal: invoiceTotals.subtotal,
            discountTotal: invoiceTotals.discountTotal,
            taxTotal: invoiceTotals.taxTotal,
            total: invoiceTotals.total,
            lines: {
              create: lineResults.map(({ line, result }) => ({
                sort: line.sort,
                lineType: line.lineType,
                name: line.name,
                description: line.description,
                qty: line.qty,
                rate: line.rate,
                period: line.period,
                discount: line.discount,
                discountIsPercentage: line.discountIsPercentage,
                sourceTable: line.sourceTable,
                sourceId: line.sourceId,
                subtotal: result.subtotal,
                taxTotal: result.taxTotal,
                total: result.total,
                taxes: {
                  create: result.taxBreakdown.map((tb) => ({
                    taxId: tb.taxId,
                    taxAmount: tb.taxAmount,
                  })),
                },
              })),
            },
          },
          include: fullInvoiceInclude,
        });
      });

      await logAudit({
        action: "CREATED",
        entityType: "Invoice",
        entityId: invoice.id,
        entityLabel: invoice.number,
        organizationId: org.id,
        userId: ctx.userId,
      }).catch(() => {}); // non-critical, don't fail the mutation

      return invoice;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(invoiceWriteSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { status: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        existing.status !== InvoiceStatus.DRAFT &&
        existing.status !== InvoiceStatus.SENT
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT or SENT invoices can be edited.",
        });
      }

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const { id, lines, ...rest } = input;

      const invoice = await ctx.db.$transaction(async (tx) => {
        if (lines !== undefined) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

          const lineResults = lines.map((line) => {
            const lineTaxes = buildTaxInputs(taxMap, line.taxIds);
            const result = calculateLineTotals(toLineInput(line), lineTaxes);
            return { line, result };
          });

          const invoiceTotals = calculateInvoiceTotals(
            lines.map(toLineInput),
            [...taxMap.values()]
          );

          return tx.invoice.update({
            where: { id, organizationId: ctx.orgId },
            data: {
              ...rest,
              subtotal: invoiceTotals.subtotal,
              discountTotal: invoiceTotals.discountTotal,
              taxTotal: invoiceTotals.taxTotal,
              total: invoiceTotals.total,
              lines: {
                create: lineResults.map(({ line, result }) => ({
                  sort: line.sort,
                  lineType: line.lineType,
                  name: line.name,
                  description: line.description,
                  qty: line.qty,
                  rate: line.rate,
                  period: line.period,
                  discount: line.discount,
                  discountIsPercentage: line.discountIsPercentage,
                  sourceTable: line.sourceTable,
                  sourceId: line.sourceId,
                  subtotal: result.subtotal,
                  taxTotal: result.taxTotal,
                  total: result.total,
                  taxes: {
                    create: result.taxBreakdown.map((tb) => ({
                      taxId: tb.taxId,
                      taxAmount: tb.taxAmount,
                    })),
                  },
                })),
              },
            },
            include: fullInvoiceInclude,
          });
        }

        return tx.invoice.update({
          where: { id, organizationId: ctx.orgId },
          data: rest,
          include: fullInvoiceInclude,
        });
      });

      await logAudit({
        action: "UPDATED",
        entityType: "Invoice",
        entityId: invoice.id,
        entityLabel: invoice.number,
        organizationId: org.id,
        userId: ctx.userId,
      }).catch(() => {}); // non-critical, don't fail the mutation

      return invoice;
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { lines: { include: { taxes: true } } },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);

        return tx.invoice.create({
          data: {
            number,
            type: source.type,
            status: InvoiceStatus.DRAFT,
            date: new Date(),
            dueDate: source.dueDate,
            currencyId: source.currencyId,
            exchangeRate: source.exchangeRate,
            simpleAmount: source.simpleAmount,
            notes: source.notes,
            clientId: source.clientId,
            organizationId: ctx.orgId,
            subtotal: source.subtotal,
            discountTotal: source.discountTotal,
            taxTotal: source.taxTotal,
            total: source.total,
            lines: {
              create: source.lines.map((line) => ({
                sort: line.sort,
                lineType: line.lineType,
                name: line.name,
                description: line.description,
                qty: line.qty,
                rate: line.rate,
                period: line.period,
                discount: line.discount,
                discountIsPercentage: line.discountIsPercentage,
                sourceTable: line.sourceTable,
                sourceId: line.sourceId,
                subtotal: line.subtotal,
                taxTotal: line.taxTotal,
                total: line.total,
                taxes: {
                  create: line.taxes.map((t) => ({
                    taxId: t.taxId,
                    taxAmount: t.taxAmount,
                  })),
                },
              })),
            },
          },
          include: fullInvoiceInclude,
        });
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string(), isArchived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isArchived: input.isArchived },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { status: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT invoices can be deleted.",
        });
      }
      return ctx.db.invoice.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),

  send: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { client: true, organization: true, currency: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const newStatus =
        invoice.type === InvoiceType.ESTIMATE ? invoice.status : InvoiceStatus.SENT;

      const updated = await ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { status: newStatus, lastSent: new Date() },
      });

      // Derive app URL from request headers (works correctly on Netlify)
      const hdrs = await headers();
      const host = hdrs.get("host") ?? "localhost:3000";
      const proto =
        hdrs.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      const appUrl = `${proto}://${host}`;

      if (invoice.client.email) {
        try {
          const { render } = await import("@react-email/render");
          const { InvoiceSentEmail } = await import("@/emails/InvoiceSentEmail");
          const resend = new Resend(env.RESEND_API_KEY);
          const html = await render(
            InvoiceSentEmail({
              invoiceNumber: invoice.number,
              clientName: invoice.client.name,
              total: Number(invoice.total).toFixed(2),
              currencySymbol: invoice.currency.symbol,
              dueDate: invoice.dueDate?.toLocaleDateString() ?? null,
              orgName: invoice.organization.name,
              portalLink: `${appUrl}/portal/${invoice.client.portalToken}`,
            })
          );

          await resend.emails.send({
            from: env.RESEND_FROM_EMAIL,
            to: invoice.client.email,
            subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
            html,
          });
        } catch {
          // Email failure is non-fatal
        }
      }

      await Promise.all([
        logAudit({
          action: "SENT",
          entityType: "Invoice",
          entityId: invoice.id,
          entityLabel: invoice.number,
          organizationId: invoice.organization.id,
          userId: ctx.userId,
        }).catch(() => {}),
        notifyOrgAdmins(invoice.organization.id, {
          type: "INVOICE_SENT",
          title: "Invoice sent",
          body: `Invoice #${invoice.number} sent to ${invoice.client.name}`,
          link: `/invoices/${invoice.id}`,
        }).catch(() => {}),
      ]);

      return updated;
    }),

  markPaid: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        amount: z.number().positive(),
        method: z.string().default("manual"),
        transactionId: z.string().optional(),
        notes: z.string().optional(),
        paidAt: z.coerce.date().default(() => new Date()),
        gatewayFee: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { status: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            amount: input.amount,
            gatewayFee: input.gatewayFee,
            method: input.method,
            transactionId: input.transactionId,
            notes: input.notes,
            paidAt: input.paidAt,
            invoiceId: input.id,
            organizationId: ctx.orgId,
          },
        });

        return tx.invoice.update({
          where: { id: input.id, organizationId: ctx.orgId },
          data: { status: InvoiceStatus.PAID },
        });
      });
    }),

  recordPartialPayment: protectedProcedure
    .input(z.object({ partialPaymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const partial = await ctx.db.partialPayment.findUnique({
        where: { id: input.partialPaymentId },
        include: {
          invoice: { select: { organizationId: true, total: true, id: true } },
        },
      });
      if (!partial || partial.invoice.organizationId !== ctx.orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.db.$transaction(async (tx) => {
        await tx.partialPayment.update({
          where: { id: input.partialPaymentId },
          data: { isPaid: true, paidAt: new Date() },
        });

        const allPartials = await tx.partialPayment.findMany({
          where: { invoiceId: partial.invoiceId },
          select: { isPaid: true },
        });

        const allPaid = allPartials.every((p) => p.isPaid);

        return tx.invoice.update({
          where: { id: partial.invoiceId, organizationId: ctx.orgId },
          data: {
            status: allPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
          },
        });
      });
    }),

  acceptEstimate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const inv = await ctx.db.invoice.findFirst({
        where: { id: input.id, organizationId: org.id, type: "ESTIMATE" },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.update({
        where: { id: input.id, organizationId: org.id },
        data: { status: "ACCEPTED" },
      });
    }),

  declineEstimate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const inv = await ctx.db.invoice.findFirst({
        where: { id: input.id, organizationId: org.id, type: "ESTIMATE" },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.invoice.update({
        where: { id: input.id, organizationId: org.id },
        data: { status: "REJECTED" },
      });
    }),
});
