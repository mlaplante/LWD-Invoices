import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { Prisma, PrismaClient, InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import { getOrgTaxMap } from "@/server/lib/tax-helpers";
import { resolveInvoiceTax, type ResolverLineInput } from "../services/invoice-tax-resolver";
import { assertInOrg } from "../lib/get-for-org";
import { resolvePartialPaymentAmount } from "../services/partial-payments";
import { idInput, paginationInput } from "../lib/schemas";
import { generateInvoiceNumber } from "../services/invoice-numbering";
import { logAudit } from "../services/audit";
import { notifyOrgAdmins } from "../services/notifications";
import { getAppUrl } from "@/lib/app-url";
import { sendPaymentReceiptEmail } from "../services/payment-receipt-email";
import {
  fullInvoiceInclude as emailInvoiceInclude,
  detailInvoiceInclude,
  summaryInvoiceInclude,
} from "@/server/lib/invoice-includes";
import { paginationFromInput } from "@/lib/pagination";
import { createRateLimiter } from "@/lib/rate-limit";
import { generatePortalToken, signPortalSession, getPortalSessionSecret } from "@/lib/portal-session";
import { cookies } from "next/headers";
import {
  buildNaturalLanguageInvoiceDraft,
  extractNaturalLanguageInvoice,
  type NaturalLanguageInvoiceContext,
} from "../services/natural-language-invoice";
import { detectInvoiceDuplicate } from "../services/invoice-duplicate";

// Bulk-payment limiter: a single org/user shouldn't fire markPaidMany more
// than 5x per minute under any legitimate workflow. Anything higher means
// either a script gone wrong or abuse — both of which we want to slow down.
const markPaidManyLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

// Natural-language drafting calls the OpenAI API, which costs real money per
// request. We throttle it per-org (not per-user) because the spend is an
// org-level resource — keying per-user would let N admins multiply the cost.
// This mirrors the in-process markPaidManyLimiter; the ceiling is therefore
// per-instance (limit × replicas), which is an acceptable worst-case OpenAI
// spend for an interactive drafting feature. Exported so tests can reset it.
export const draftFromPromptLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

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
  projectId: z.string().nullable().optional(),
  lines: z.array(lineSchema).default([]),
  reminderDaysOverride: z.array(z.number().int().min(1)).optional(),
  reminderSequenceId: z.string().nullable().optional(),
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
  applyCreditBalance: z.boolean().optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toResolverLine(line: z.infer<typeof lineSchema>): ResolverLineInput {
  return {
    reference: String(line.sort),
    qty: line.qty,
    rate: line.rate,
    period: line.period,
    lineType: line.lineType,
    discount: line.discount,
    discountIsPercentage: line.discountIsPercentage,
    taxIds: line.taxIds,
  };
}

async function updateEstimateStatus(
  ctx: { db: PrismaClient; orgId: string },
  id: string,
  status: InvoiceStatus,
) {
  const inv = await ctx.db.invoice.findFirst({
    where: { id, organizationId: ctx.orgId, type: "ESTIMATE" },
  });
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  return ctx.db.invoice.update({
    where: { id, organizationId: ctx.orgId },
    data: { status },
  });
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const invoicesRouter = router({
  list: protectedProcedure
    .input(
      paginationInput.extend({
        status: z.array(z.nativeEnum(InvoiceStatus)).optional(),
        type: z.nativeEnum(InvoiceType).optional(),
        clientId: z.string().optional(),
        projectId: z.string().optional(),
        isChangeOrder: z.boolean().optional(),
        includeArchived: z.boolean().default(false),
        recurring: z.boolean().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        search: z.string().max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.InvoiceWhereInput = {
        organizationId: ctx.orgId,
        ...(input.status?.length ? { status: { in: input.status } } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.isChangeOrder !== undefined ? { isChangeOrder: input.isChangeOrder } : {}),
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

      const { skip, take } = paginationFromInput({ page: input.page, pageSize: input.pageSize });
      const [items, total] = await ctx.db.$transaction([
        ctx.db.invoice.findMany({
          where,
          include: summaryInvoiceInclude,
          orderBy: { date: "desc" },
          skip,
          take,
        }),
        ctx.db.invoice.count({ where }),
      ]);

      return { items, total };
    }),

  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: detailInvoiceInclude,
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      return invoice;
    }),

  // Email engagement timeline (delivery/open/click events) for one invoice.
  // Populated by the Resend webhook via the `invoice_id` tag on outgoing mail.
  getEmailEvents: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.emailEvent.findMany({
        where: { invoiceId: input.invoiceId },
        select: { id: true, type: true, occurredAt: true, recipient: true, link: true },
        orderBy: { occurredAt: "asc" },
      });
    }),

  // Client replies captured by the inbound-email webhook and threaded onto this
  // invoice (closes the communication loop).
  inboundReplies: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.inboundEmail.findMany({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
        select: {
          id: true,
          fromEmail: true,
          subject: true,
          bodyText: true,
          receivedAt: true,
          ticketId: true,
        },
        orderBy: { receivedAt: "desc" },
      });
    }),

  // Combined reminder history for an invoice: ad-hoc manual sends
  // (InvoiceReminder) + automated sequence sends (ReminderLog), newest first.
  reminderHistory: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const [manual, sequence] = await Promise.all([
        ctx.db.invoiceReminder.findMany({
          where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
          select: { id: true, sentAt: true, subject: true, tone: true, source: true },
        }),
        ctx.db.reminderLog.findMany({
          where: { invoiceId: input.invoiceId },
          select: {
            id: true,
            sentAt: true,
            step: { select: { subject: true, sequence: { select: { name: true } } } },
          },
        }),
      ]);

      const entries = [
        ...manual.map((m) => ({
          id: m.id,
          kind: "manual" as const,
          sentAt: m.sentAt,
          subject: m.subject,
          tone: m.tone,
          source: m.source,
          sequenceName: null as string | null,
        })),
        ...sequence.map((s) => ({
          id: s.id,
          kind: "sequence" as const,
          sentAt: s.sentAt,
          subject: s.step.subject,
          tone: null as string | null,
          source: null as string | null,
          sequenceName: s.step.sequence.name,
        })),
      ].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

      return entries;
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

  // Duplicate guard for the invoice-create flow: given the client + amount the
  // user is about to bill, surface recent same-client invoices with a
  // near-identical total so a double-bill can be caught before sending. The
  // window is queried wide enough to cover the detector's date tolerance in
  // both directions; the pure detector applies the precise window/amount rules.
  checkDuplicate: protectedProcedure
    .input(
      z.object({
        clientId: z.string(),
        amount: z.number().nonnegative(),
        excludeInvoiceId: z.string().optional(),
        windowDays: z.number().int().min(1).max(180).default(30),
        amountTolerancePercent: z.number().min(0).max(100).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const since = new Date(now.getTime() - input.windowDays * 86_400_000);
      const candidates = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          clientId: input.clientId,
          isArchived: false,
          type: { not: "ESTIMATE" },
          date: { gte: since },
          ...(input.excludeInvoiceId ? { id: { not: input.excludeInvoiceId } } : {}),
        },
        select: { id: true, number: true, clientId: true, total: true, date: true },
        orderBy: { date: "desc" },
        take: 100,
      });

      return detectInvoiceDuplicate(
        { clientId: input.clientId, amount: input.amount, issueDate: now },
        candidates.map((c) => ({
          id: c.id,
          invoiceNumber: c.number,
          clientId: c.clientId,
          amount: Number(c.total),
          issueDate: c.date,
        })),
        { windowDays: input.windowDays, amountTolerancePercent: input.amountTolerancePercent },
      );
    }),

  draftFromPrompt: requireRole("OWNER", "ADMIN")
    .input(z.object({ prompt: z.string().trim().min(5).max(2_000) }))
    .mutation(async ({ ctx, input }) => {
      // Throttle before any DB work or the OpenAI call — a runaway client or
      // script shouldn't be able to rack up API charges (or DB load) by
      // hammering this endpoint.
      if (draftFromPromptLimiter.isLimited(ctx.orgId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many invoice drafting requests. Try again in a minute.",
        });
      }

      const [clients, items, taxes, currencies] = await Promise.all([
        ctx.db.client.findMany({
          where: { organizationId: ctx.orgId, isArchived: false },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        ctx.db.item.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true, description: true, rate: true, unit: true },
          orderBy: { name: "asc" },
        }),
        ctx.db.tax.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true, rate: true },
          orderBy: { name: "asc" },
        }),
        ctx.db.currency.findMany({
          where: { organizationId: ctx.orgId },
          orderBy: [{ isDefault: "desc" }, { code: "asc" }],
          take: 1,
        }),
      ]);

      const defaultCurrency = currencies[0];
      if (!defaultCurrency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set up a currency before drafting an invoice." });
      }

      const context: NaturalLanguageInvoiceContext = {
        defaultCurrencyId: defaultCurrency.id,
        clients,
        items: items.map((item) => ({
          ...item,
          rate: item.rate === null || item.rate === undefined ? null : Number(item.rate),
        })),
        taxes: taxes.map((tax) => ({
          ...tax,
          rate: tax.rate === null || tax.rate === undefined ? null : Number(tax.rate),
        })),
      };

      const extraction = await extractNaturalLanguageInvoice(input.prompt);
      return buildNaturalLanguageInvoiceDraft({ prompt: input.prompt, extraction, context });
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(invoiceWriteWithScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true,
          stripeTaxEnabled: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      // The new invoice carries organizationId: ctx.orgId, but that does not
      // verify the referenced client is in this tenant. Check it before any
      // client-scoped read/write (tax resolution, credit-balance application).
      await assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });
      if (input.projectId) {
        await assertInOrg(ctx.db.project, input.projectId, ctx.orgId, { entityName: "Project" });
      }

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);

      // Resolve tax outside the transaction: Stripe Tax path makes an external
      // API call we don't want to hold a DB tx open across.
      const resolved = await resolveInvoiceTax({
        db: ctx.db as unknown as PrismaClient,
        org,
        clientId: input.clientId,
        currencyId: input.currencyId,
        lines: input.lines.map(toResolverLine),
        discountType: input.discountType ?? null,
        discountAmount: input.discountAmount ?? 0,
        taxMap,
      });

      const invoice = await ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);

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
            projectId: input.projectId ?? null,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            reminderDaysOverride: input.reminderDaysOverride ?? [],
            discountType: input.discountType ?? null,
            discountAmount: input.discountAmount ?? 0,
            discountDescription: input.discountDescription ?? null,
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
            stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
            lines: {
              create: input.lines.map((line, i) => {
                const r = resolved.lines[i];
                return {
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
                  subtotal: r.subtotal,
                  taxTotal: r.taxTotal,
                  total: r.total,
                  taxes: { create: r.legacyTaxBreakdown },
                  stripeTaxBreakdown: { create: r.stripeTaxBreakdown },
                };
              }),
            },
          },
          include: detailInvoiceInclude,
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

        if (input.applyCreditBalance) {
          const clientRecord = await tx.client.findUnique({
            where: { id: input.clientId },
            select: { creditBalance: true },
          });

          if (clientRecord && clientRecord.creditBalance.toNumber() > 0) {
            const creditToApply = Math.min(
              clientRecord.creditBalance.toNumber(),
              created.total.toNumber(),
            );

            await tx.invoice.update({
              where: { id: created.id },
              data: { creditApplied: creditToApply },
            });

            await tx.client.update({
              where: { id: input.clientId },
              data: { creditBalance: { decrement: creditToApply } },
            });

            // If credit covers the full amount, auto-mark as paid
            if (creditToApply >= created.total.toNumber()) {
              await tx.invoice.update({
                where: { id: created.id },
                data: { status: InvoiceStatus.PAID },
              });
              await tx.payment.create({
                data: {
                  amount: creditToApply,
                  method: "credit",
                  invoiceId: created.id,
                  organizationId: ctx.orgId,
                },
              });
            }
          }
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

  createChangeOrder: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        projectId: z.string().min(1),
        date: z.coerce.date().default(() => new Date()),
        notes: z.string().optional(),
        lines: z.array(lineSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Cross-tenant guard (parity with create's client check, commit f7f22b1).
      // Hand-rolled (not assertInOrg) so we fetch clientId/currencyId in the same
      // org-scoped query instead of a second round-trip.
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, organizationId: ctx.orgId },
        select: { id: true, clientId: true, currencyId: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true, stripeTaxEnabled: true, addressLine1: true, addressLine2: true,
          city: true, state: true, postalCode: true, country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const resolved = await resolveInvoiceTax({
        db: ctx.db as unknown as PrismaClient,
        org,
        clientId: project.clientId,
        currencyId: project.currencyId,
        lines: input.lines.map(toResolverLine),
        discountType: null,
        discountAmount: 0,
        taxMap,
      });

      const invoice = await ctx.db.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);
        return tx.invoice.create({
          data: {
            number,
            type: InvoiceType.ESTIMATE,
            status: InvoiceStatus.DRAFT,
            isChangeOrder: true,
            date: input.date,
            notes: input.notes,
            clientId: project.clientId,
            projectId: project.id,
            currencyId: project.currencyId,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
            stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
            lines: {
              create: input.lines.map((line, i) => {
                const r = resolved.lines[i];
                return {
                  sort: line.sort, lineType: line.lineType, name: line.name,
                  description: line.description, qty: line.qty, rate: line.rate,
                  period: line.period, discount: line.discount,
                  discountIsPercentage: line.discountIsPercentage,
                  sourceTable: line.sourceTable, sourceId: line.sourceId,
                  subtotal: r.subtotal, taxTotal: r.taxTotal, total: r.total,
                  taxes: { create: r.legacyTaxBreakdown },
                  stripeTaxBreakdown: { create: r.stripeTaxBreakdown },
                };
              }),
            },
          },
          include: detailInvoiceInclude,
        });
      });

      await logAudit({
        action: "CREATED", entityType: "Invoice", entityId: invoice.id,
        entityLabel: invoice.number, organizationId: ctx.orgId, userId: ctx.userId,
      }).catch(() => {});

      return invoice;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).merge(invoiceWriteWithScheduleSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true,
          stripeTaxEnabled: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
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

      // Re-pointing an invoice at a client from another tenant would leak that
      // client into tax resolution and the persisted row; verify ownership.
      if (input.clientId !== undefined) {
        await assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });
      }

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const { id, lines, partialPayments, discountType, discountAmount, discountDescription, ...rest } = input;

      // Resolve tax outside the transaction (Stripe Tax may make an external call).
      let resolved: Awaited<ReturnType<typeof resolveInvoiceTax>> | null = null;
      if (lines !== undefined) {
        const targetCurrencyId = input.currencyId
          ?? (await ctx.db.invoice.findUniqueOrThrow({
            where: { id, organizationId: ctx.orgId },
            select: { currencyId: true },
          })).currencyId;
        resolved = await resolveInvoiceTax({
          db: ctx.db as unknown as PrismaClient,
          org,
          clientId: input.clientId
            ?? (await ctx.db.invoice.findUniqueOrThrow({
              where: { id, organizationId: ctx.orgId },
              select: { clientId: true },
            })).clientId,
          currencyId: targetCurrencyId,
          lines: lines.map(toResolverLine),
          discountType: discountType ?? null,
          discountAmount: discountAmount ?? 0,
          taxMap,
        });
      }

      const invoice = await ctx.db.$transaction(async (tx) => {
        let updated;

        if (lines !== undefined && resolved) {
          await tx.invoiceLine.deleteMany({
            where: { invoiceId: id, invoice: { organizationId: ctx.orgId } },
          });

          updated = await tx.invoice.update({
            where: { id, organizationId: ctx.orgId },
            data: {
              ...rest,
              discountType: discountType ?? null,
              discountAmount: discountAmount ?? 0,
              discountDescription: discountDescription ?? null,
              subtotal: resolved.invoice.subtotal,
              discountTotal: resolved.invoice.discountTotal,
              taxTotal: resolved.invoice.taxTotal,
              total: resolved.invoice.total,
              stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
              lines: {
                create: lines.map((line, i) => {
                  const r = resolved!.lines[i];
                  return {
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
                    subtotal: r.subtotal,
                    taxTotal: r.taxTotal,
                    total: r.total,
                    taxes: { create: r.legacyTaxBreakdown },
                    stripeTaxBreakdown: { create: r.stripeTaxBreakdown },
                  };
                }),
              },
            },
            include: detailInvoiceInclude,
          });
        } else {
          updated = await tx.invoice.update({
            where: { id, organizationId: ctx.orgId },
            data: rest,
            include: detailInvoiceInclude,
          });
        }

        if (partialPayments !== undefined) {
          await tx.partialPayment.deleteMany({
            where: { invoiceId: id, isPaid: false, organizationId: ctx.orgId },
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
    .input(idInput)
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
            projectId: source.projectId,
            isChangeOrder: false,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
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
          include: detailInvoiceInclude,
        });
      });
    }),

  duplicate: requireRole("OWNER", "ADMIN")
    .input(idInput)
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
            portalToken: generatePortalToken(),
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
          include: detailInvoiceInclude,
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
    .input(idInput)
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
        include: emailInvoiceInclude,
      });

      if (invoices.length === 0) {
        return { sent: 0, failed: 0, skipped: input.ids.length, errors: [] as string[] };
      }

      const appUrl = await getAppUrl();

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
          try {
            const { sendInvoiceSentEmail } = await import("@/server/services/invoice-sent-email");
            await sendInvoiceSentEmail(invoice, appUrl);
          } catch (err) {
            console.error(`[invoices.sendMany] Failed to email invoice ${invoice.number}:`, err);
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
      // Throttle by (orgId, userId) — a script firing the bulk endpoint
      // in a tight loop should hit the brake before exhausting DB work.
      const key = `${ctx.orgId}:${ctx.userId ?? "anon"}`;
      if (markPaidManyLimiter.isLimited(key)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many bulk-mark-paid requests. Try again in a minute.",
        });
      }

      // Fetch eligible invoices with their totals
      const invoices = await ctx.db.invoice.findMany({
        where: {
          id: { in: input.ids },
          organizationId: ctx.orgId,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        },
        select: { id: true, total: true, number: true, type: true, clientId: true },
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

          // Credit client balance for deposit invoices
          if (invoice.type === "DEPOSIT") {
            await ctx.db.client.update({
              where: { id: invoice.clientId },
              data: { creditBalance: { increment: invoice.total } },
            });
          }
        })
      );

      const paid = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      results.forEach((r) => {
        if (r.status === "rejected") {
          errors.push(r.reason?.message ?? "Unknown error");
        }
      });

      // Fire automation events and send receipt emails for successful payments
      if (paid > 0) {
        const successInvoices = invoices.filter((_, i) => results[i]!.status === "fulfilled");

        try {
          const { inngest: inngestClient } = await import("@/inngest/client");
          await Promise.all(
            successInvoices.map((inv) =>
              inngestClient.send({
                name: "invoice/payment.received",
                data: { invoiceId: inv.id, trigger: "PAYMENT_RECEIVED" },
              })
            )
          );
        } catch {
          // Non-fatal
        }

        // Send receipt emails directly (with BCC to owner)
        for (const inv of successInvoices) {
          try {
            await sendPaymentReceiptEmail({
              invoiceId: inv.id,
              amountPaid: inv.total.toNumber(),
              organizationId: ctx.orgId,
            });
          } catch (err) {
            console.error("[markPaidMany] Failed to send receipt email:", err);
          }
        }
      }

      return { paid, failed, skipped: input.ids.length - invoices.length, errors };
    }),

  previewEmail: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          client: true,
          organization: true,
          currency: true,
          partialPayments: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const { render } = await import("@react-email/render");
      const { InvoiceSentEmail } = await import("@/emails/InvoiceSentEmail");
      const { getAppUrl } = await import("@/lib/app-url");
      const appUrl = await getAppUrl();

      const partialPayments = invoice.partialPayments
        ?.sort((a, b) => a.sortOrder - b.sortOrder)
        .map((pp) => ({
          amount: resolvePartialPaymentAmount(pp, invoice.total).toFixed(2),
          dueDate: pp.dueDate?.toLocaleDateString() ?? null,
          isPaid: pp.isPaid,
        }));

      const html = await render(
        InvoiceSentEmail({
          invoiceNumber: invoice.number,
          clientName: invoice.client.name,
          total: invoice.total.toNumber().toFixed(2),
          currencySymbol: invoice.currency.symbol,
          dueDate: invoice.dueDate?.toLocaleDateString() ?? null,
          orgName: invoice.organization.name,
          portalLink: `${appUrl}/portal/${invoice.portalToken}`,
          logoUrl: invoice.organization.logoUrl ?? undefined,
          partialPayments: partialPayments && partialPayments.length > 0 ? partialPayments : undefined,
        })
      );

      return {
        to: invoice.client.email ?? "(no email)",
        cc: invoice.client.ccEmails ?? [],
        subject: `Invoice #${invoice.number} from ${invoice.organization.name}`,
        html,
        scheduledSendAt: invoice.scheduledSendAt,
      };
    }),

  send: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        // Per-send override; when omitted, the service falls back to
        // client.ccEmails. Capped at 10 to match MAX_CC_RECIPIENTS.
        cc: z.array(z.string().email()).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { deliverInvoice } = await import("@/server/services/invoice-send");
      const updated = await deliverInvoice(ctx.db, input.id, ctx.orgId, {
        cc: input.cc,
        userId: ctx.userId,
      });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  // Queue the invoice to be emailed at a future instant by the
  // scheduled-invoice-sends cron — typically the client's best-send-window
  // recommendation, but any future time works.
  scheduleSend: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        sendAt: z.coerce.date(),
        cc: z.array(z.string().email()).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { number: true, isArchived: true, client: { select: { email: true } } },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.isArchived) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot schedule an archived invoice." });
      }
      if (!invoice.client.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This client has no email address, so the scheduled send would fail.",
        });
      }
      const now = Date.now();
      if (input.sendAt.getTime() <= now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future." });
      }
      if (input.sendAt.getTime() > now + 90 * 24 * 60 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be within 90 days." });
      }

      const updated = await ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { scheduledSendAt: input.sendAt, scheduledSendCc: input.cc ?? [] },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Invoice",
        entityId: input.id,
        entityLabel: invoice.number,
        diff: { scheduledSendAt: input.sendAt.toISOString() },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
      return updated;
    }),

  cancelScheduledSend: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { number: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { scheduledSendAt: null, scheduledSendCc: [] },
      });
      await logAudit({
        action: "UPDATED",
        entityType: "Invoice",
        entityId: input.id,
        entityLabel: invoice.number,
        diff: { scheduledSendAt: null },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});
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
        select: { status: true, type: true, clientId: true, total: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await ctx.db.$transaction(async (tx) => {
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

      // Credit client balance for deposit invoices
      if (invoice.type === "DEPOSIT") {
        await ctx.db.client.update({
          where: { id: invoice.clientId },
          data: { creditBalance: { increment: invoice.total } },
        });
      }

      // Fire automation event for payment receipt emails
      try {
        const { inngest: inngestClient } = await import("@/inngest/client");
        await inngestClient.send({
          name: "invoice/payment.received",
          data: { invoiceId: input.id, trigger: "PAYMENT_RECEIVED" },
        });
      } catch {
        // Non-fatal
      }

      // Send payment receipt email directly (with BCC to owner)
      try {
        await sendPaymentReceiptEmail({
          invoiceId: input.id,
          amountPaid: input.amount,
          organizationId: ctx.orgId,
        });
      } catch (err) {
        console.error("[markPaid] Failed to send payment receipt email:", err);
      }

      return result;
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

      const result = await ctx.db.$transaction(
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

      // Fire automation event for payment received
      try {
        const { inngest: inngestClient } = await import("@/inngest/client");
        await inngestClient.send({
          name: "invoice/payment.received",
          data: { invoiceId: partial.invoiceId, trigger: "PAYMENT_RECEIVED" },
        });
      } catch {
        // Non-fatal
      }

      // Send payment receipt email directly (with BCC to owner)
      try {
        const installmentAmount = resolvePartialPaymentAmount(partial, partial.invoice.total);
        await sendPaymentReceiptEmail({
          invoiceId: partial.invoiceId,
          amountPaid: installmentAmount,
          organizationId: ctx.orgId,
          partialPaymentId: input.partialPaymentId,
        });
      } catch (err) {
        console.error("[recordPartialPayment] Failed to send receipt email:", err);
      }

      return result;
    }),

  // Lightweight lookup used by SendReceiptButton to pre-fill the CC dialog
  // without re-rendering the full receipt HTML (no template needed at confirm
  // time — the user is just choosing recipients).
  receiptRecipients: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        select: {
          number: true,
          client: { select: { email: true, ccEmails: true, name: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        invoiceNumber: invoice.number,
        clientName: invoice.client.name,
        to: invoice.client.email ?? "(no email)",
        cc: invoice.client.ccEmails ?? [],
      };
    }),

  sendReceipt: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        cc: z.array(z.string().email()).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { payments: { orderBy: { paidAt: "desc" }, take: 1 } },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.PARTIALLY_PAID) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice has no payments" });
      }

      const lastPayment = invoice.payments[0];
      await sendPaymentReceiptEmail({
        invoiceId: input.id,
        amountPaid: lastPayment?.amount.toNumber() ?? invoice.total.toNumber(),
        organizationId: ctx.orgId,
        ccOverride: input.cc,
      });

      return { sent: true };
    }),

  acceptEstimate: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => updateEstimateStatus(ctx, input.id, "ACCEPTED")),

  declineEstimate: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => updateEstimateStatus(ctx, input.id, "REJECTED")),

  // Issues a fresh portalToken for an invoice, invalidating every existing
  // /portal/<token> and /pay/<token> link. Use when a link has been shared
  // beyond the intended audience (forwarded email, indexed accidentally,
  // exposed in a screenshot).
  rotatePortalToken: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.invoice.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, number: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const newToken = generatePortalToken();

      const updated = await ctx.db.invoice.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { portalToken: newToken },
        select: { portalToken: true },
      });

      await logAudit({
        action: "UPDATED",
        entityType: "Invoice",
        entityId: input.id,
        entityLabel: `Invoice #${existing.number}`,
        diff: { event: "portal_token_rotated" },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { portalToken: updated.portalToken };
    }),

  // "View as client" for a single invoice portal: sets the same signed
  // session cookie the passphrase gate would, so staff can preview the
  // portal without knowing the client's passphrase — including after the
  // client has changed it via the self-service reset. Audited per use.
  previewPortal: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        select: { id: true, number: true, portalToken: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const sessionVal = signPortalSession(invoice.portalToken, getPortalSessionSecret());
      const cookieStore = await cookies();
      cookieStore.set(`portal_auth_${invoice.portalToken}`, sessionVal, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour — long enough to look around
        path: `/portal/${invoice.portalToken}`,
      });

      await logAudit({
        action: "VIEWED",
        entityType: "Invoice.Portal",
        entityId: invoice.id,
        entityLabel: `Invoice #${invoice.number}`,
        diff: { event: "portal_admin_preview" },
        userId: ctx.userId,
        organizationId: ctx.orgId,
      }).catch(() => {});

      return { url: `/portal/${invoice.portalToken}` };
    }),

  lastForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const last = await ctx.db.invoice.findFirst({
        where: { organizationId: ctx.orgId, clientId: input.clientId },
        orderBy: { date: "desc" },
        select: {
          type: true,
          currencyId: true,
          notes: true,
          lines: {
            select: {
              sort: true,
              lineType: true,
              name: true,
              description: true,
              qty: true,
              rate: true,
              period: true,
              discount: true,
              discountIsPercentage: true,
              taxes: { select: { taxId: true } },
            },
            orderBy: { sort: "asc" },
          },
        },
      });
      if (!last) return null;
      return {
        type: last.type,
        currencyId: last.currencyId,
        notes: last.notes,
        lines: last.lines.map((l, idx) => ({
          sort: idx,
          lineType: l.lineType,
          name: l.name,
          description: l.description ?? undefined,
          qty: Number(l.qty),
          rate: Number(l.rate),
          period: l.period != null ? Number(l.period) : undefined,
          discount: Number(l.discount),
          discountIsPercentage: l.discountIsPercentage,
          taxIds: l.taxes.map((t) => t.taxId),
        })),
      };
    }),

  openForReminder: protectedProcedure
    .input(z.object({ q: z.string().trim().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.invoice.findMany({
        where: {
          organizationId: ctx.orgId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          ...(input.q
            ? {
                OR: [
                  { number: { contains: input.q, mode: "insensitive" } },
                  { client: { is: { name: { contains: input.q, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          dueDate: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      });
      return rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        total: Number(r.total),
        dueDate: r.dueDate,
        clientName: r.client?.name ?? "—",
      }));
    }),
});
