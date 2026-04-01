import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { Prisma, PrismaClient, InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import {
  calculateLineTotals,
  calculateInvoiceTotals,
  calculateInvoiceTotalsWithDiscount,
  type TaxInput,
  type LineInput,
} from "../services/tax-calculator";
import { generateInvoiceNumber } from "../services/invoice-numbering";
import { logAudit } from "../services/audit";
import { notifyOrgAdmins } from "../services/notifications";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { getOwnerBcc } from "../services/email-bcc";

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
  reminderDaysOverride: z.array(z.number().int().min(1)).optional(),
  discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
  discountAmount: z.number().min(0).default(0),
  discountDescription: z.string().max(200).optional(),
});

const partialPaymentInputSchema = z.object({
  sortOrder: z.number().int().default(0),
  amount: z.number().positive(),
  isPercentage: z.boolean().default(false),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

const invoiceWriteWithScheduleSchema = invoiceWriteSchema.extend({
  partialPayments: z.array(partialPaymentInputSchema).optional(),
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
  proposalContent: true,
  partialPayments: { orderBy: { sortOrder: "asc" as const } },
};

// Summary include for list queries
const summaryInvoiceInclude = {
  client: { select: { id: true, name: true } },
  currency: { select: { id: true, symbol: true, symbolPosition: true } },
  recurringInvoice: { select: { isActive: true, frequency: true } },
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
        recurring: z.boolean().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.InvoiceWhereInput = {
        organizationId: ctx.orgId,
        ...(input.status?.length ? { status: { in: input.status } } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.includeArchived ? {} : { isArchived: false }),
        ...(input.recurring ? { recurringInvoice: { isActive: true } } : {}),
        ...(input.dateFrom || input.dateTo
          ? {
              date: {
                ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                ...(input.dateTo ? { lte: input.dateTo } : {}),
              },
            }
          : {}),
        ...(input.search
          ? {
              OR: [
                { number: { contains: input.search, mode: "insensitive" } },
                { client: { name: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };

      const [items, total] = await ctx.db.$transaction([
        ctx.db.invoice.findMany({
          where,
          include: summaryInvoiceInclude,
          orderBy: { date: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.invoice.count({ where }),
      ]);

      return { items, total };
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

  recentlyViewed: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          lastViewed: { not: null },
          isArchived: false,
        },
        select: {
          id: true,
          number: true,
          type: true,
          lastViewed: true,
          status: true,
          total: true,
          client: { select: { id: true, name: true } },
          currency: { select: { symbol: true, symbolPosition: true } },
        },
        orderBy: { lastViewed: "desc" },
        take: input.limit,
      });
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(invoiceWriteWithScheduleSchema)
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

        const invoiceTotals = calculateInvoiceTotalsWithDiscount(
          input.lines.map(toLineInput),
          [...taxMap.values()],
          input.discountType ?? null,
          input.discountAmount ?? 0
        );

        const created = await tx.invoice.create({
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
            reminderDaysOverride: input.reminderDaysOverride ?? [],
            discountType: input.discountType ?? null,
            discountAmount: input.discountAmount ?? 0,
            discountDescription: input.discountDescription ?? null,
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

        if (input.partialPayments && input.partialPayments.length > 0) {
          await tx.partialPayment.createMany({
            data: input.partialPayments.map((s) => ({
              ...s,
              invoiceId: created.id,
              organizationId: ctx.orgId,
            })),
          });
        }

        return created;
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

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).merge(invoiceWriteWithScheduleSchema.partial()))
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
      const { id, lines, partialPayments, discountType, discountAmount, discountDescription, ...rest } = input;

      const invoice = await ctx.db.$transaction(async (tx) => {
        let updated;

        if (lines !== undefined) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

          const lineResults = lines.map((line) => {
            const lineTaxes = buildTaxInputs(taxMap, line.taxIds);
            const result = calculateLineTotals(toLineInput(line), lineTaxes);
            return { line, result };
          });

          const invoiceTotals = calculateInvoiceTotalsWithDiscount(
            lines.map(toLineInput),
            [...taxMap.values()],
            discountType ?? null,
            discountAmount ?? 0
          );

          updated = await tx.invoice.update({
            where: { id, organizationId: ctx.orgId },
            data: {
              ...rest,
              discountType: discountType ?? null,
              discountAmount: discountAmount ?? 0,
              discountDescription: discountDescription ?? null,
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
        } else {
          updated = await tx.invoice.update({
            where: { id, organizationId: ctx.orgId },
            data: rest,
            include: fullInvoiceInclude,
          });
        }

        if (partialPayments !== undefined) {
          await tx.partialPayment.deleteMany({
            where: { invoiceId: id, isPaid: false },
          });
          if (partialPayments.length > 0) {
            await tx.partialPayment.createMany({
              data: partialPayments.map((s) => ({
                ...s,
                invoiceId: id,
                organizationId: ctx.orgId,
              })),
            });
          }
        }

        return updated;
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

  convertEstimateToInvoice: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { lines: { include: { taxes: true } } },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      if (source.type !== InvoiceType.ESTIMATE) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only estimates can be converted to invoices" });
      }
      if (source.status !== InvoiceStatus.ACCEPTED) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only accepted estimates can be converted" });
      }

      return ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);

        return tx.invoice.create({
          data: {
            number,
            type: InvoiceType.DETAILED,
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

  duplicate: requireRole("OWNER", "ADMIN")
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

  archive: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string(), isArchived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { isArchived: input.isArchived },
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { status: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.PARTIALLY_PAID ||
        invoice.status === InvoiceStatus.OVERDUE
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoices that have been paid, partially paid, or are overdue cannot be deleted.",
        });
      }
      return ctx.db.invoice.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
    }),

  archiveMany: requireRole("OWNER", "ADMIN")
    .input(z.object({ ids: z.array(z.string()), isArchived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.invoice.updateMany({
        where: { id: { in: input.ids }, organizationId: ctx.orgId },
        data: { isArchived: input.isArchived },
      });
    }),

  deleteMany: requireRole("OWNER", "ADMIN")
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Only delete invoices that are not PAID, PARTIALLY_PAID, or OVERDUE
      const deletable = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        },
        select: { id: true },
      });
      const deletableIds = deletable.map((i) => i.id);
      if (deletableIds.length === 0) return { count: 0 };
      return ctx.db.invoice.deleteMany({
        where: { id: { in: deletableIds }, organizationId: ctx.orgId },
      });
    }),

  sendMany: requireRole("OWNER", "ADMIN")
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: InvoiceStatus.DRAFT,
          type: { notIn: [InvoiceType.CREDIT_NOTE] },
        },
        include: { client: true, organization: true, currency: true },
      });

      if (invoices.length === 0) {
        return { sent: 0, failed: 0, skipped: input.ids.length, errors: [] as string[] };
      }

      const hdrs = await headers();
      const host = hdrs.get("host") ?? "localhost:3000";
      const proto =
        hdrs.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      const appUrl = `${proto}://${host}`;

      const errors: string[] = [];
      const results = await Promise.allSettled(
        invoices.map(async (invoice) => {
          // Update status
          await ctx.db.invoice.update({
            where: { id: invoice.id, organizationId: ctx.orgId },
            data: {
              status: invoice.type === InvoiceType.ESTIMATE ? invoice.status : InvoiceStatus.SENT,
              lastSent: new Date(),
            },
          });

          // Send email if client has email
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
                  portalLink: `${appUrl}/portal/${invoice.portalToken}`,
                  logoUrl: invoice.organization.logoUrl ?? undefined,
                })
              );

              const bcc = await getOwnerBcc(invoice.organizationId);
              await resend.emails.send({
                from: env.RESEND_FROM_EMAIL,
                to: invoice.client.email,
                subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
                html,
                ...(bcc ? { bcc } : {}),
              });
            } catch (err) {
              console.error(`[invoices.sendMany] Failed to email invoice ${invoice.number}:`, err);
            }
          }

          // Audit + notification (non-blocking)
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
        })
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      results.forEach((r) => {
        if (r.status === "rejected") {
          errors.push(r.reason?.message ?? "Unknown error");
        }
      });

      return {
        sent,
        failed,
        skipped: input.ids.length - invoices.length,
        errors,
      };
    }),

  markPaidMany: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(50),
        method: z.string().default("manual"),
        paidAt: z.coerce.date().default(() => new Date()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch eligible invoices with their totals
      const invoices = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        },
        select: { id: true, total: true, number: true },
      });

      if (invoices.length === 0) {
        return { paid: 0, failed: 0, skipped: input.ids.length, errors: [] as string[] };
      }

      const errors: string[] = [];
      const results = await Promise.allSettled(
        invoices.map(async (invoice) => {
          await ctx.db.$transaction(async (tx) => {
            await tx.payment.create({
              data: {
                amount: invoice.total,
                method: input.method,
                paidAt: input.paidAt,
                invoiceId: invoice.id,
                organizationId: ctx.orgId,
              },
            });
            await tx.invoice.update({
              where: { id: invoice.id, organizationId: ctx.orgId },
              data: { status: InvoiceStatus.PAID },
            });
          });
        })
      );

      const paid = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      results.forEach((r) => {
        if (r.status === "rejected") {
          errors.push(r.reason?.message ?? "Unknown error");
        }
      });

      return { paid, failed, skipped: input.ids.length - invoices.length, errors };
    }),

  send: requireRole("OWNER", "ADMIN")
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
              portalLink: `${appUrl}/portal/${invoice.portalToken}`,
              logoUrl: invoice.organization.logoUrl ?? undefined,
            })
          );

          const bcc = await getOwnerBcc(invoice.organizationId);
          await resend.emails.send({
            from: env.RESEND_FROM_EMAIL,
            to: invoice.client.email,
            subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
            html,
            ...(bcc ? { bcc } : {}),
          });
        } catch (err) {
          console.error("[invoices.send] Failed to send invoice email:", err);
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

  markPaid: requireRole("OWNER", "ADMIN")
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

  recordPartialPayment: requireRole("OWNER", "ADMIN")
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

      return ctx.db.$transaction(
        async (tx) => {
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
        },
        { isolationLevel: "Serializable" },
      );
    }),

  acceptEstimate: requireRole("OWNER", "ADMIN")
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

  declineEstimate: requireRole("OWNER", "ADMIN")
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
