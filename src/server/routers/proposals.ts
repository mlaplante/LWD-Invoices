import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema } from "./proposal-templates-helpers";
import { deriveProposalStatus } from "./proposals-helpers";
import { deleteProposalFile } from "@/lib/supabase/storage";
import { generateProposal } from "@/server/services/proposal-generator";
import { Prisma, InvoiceStatus, InvoiceType, LineType } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma";
import { getOrgTaxMap } from "@/server/lib/tax-helpers";
import { resolveInvoiceTax } from "@/server/services/invoice-tax-resolver";
import { generateInvoiceNumber } from "@/server/services/invoice-numbering";
import { generatePortalToken } from "@/lib/portal-session";
import { assertInOrg } from "@/server/lib/get-for-org";
import { assertAiRateLimit } from "@/server/lib/ai-rate-limit";

const wizardLineSchema = z.object({
  name: z.string().min(1),
  qty: z.number().default(1),
  rate: z.number().default(0),
  sourceId: z.string().optional(), // org Item id, for traceability
});

async function buildProposalDraft(
  ctx: { db: PrismaClient; orgId: string },
  args: {
    clientName: string;
    projectName: string | null;
    projectDescription: string | null;
    templateId?: string;
    excludeInvoiceId?: string;
  },
) {
  assertAiRateLimit("proposalGeneration", ctx.orgId);
  const template = await ctx.db.proposalTemplate.findFirst({
    where: args.templateId
      ? { id: args.templateId, organizationId: ctx.orgId }
      : { organizationId: ctx.orgId, isDefault: true },
  });
  if (!template)
    throw new TRPCError({ code: "BAD_REQUEST", message: "No template available to generate from" });

  const [pastProposals, items] = await Promise.all([
    ctx.db.proposalContent.findMany({
      where: {
        organizationId: ctx.orgId,
        ...(args.excludeInvoiceId ? { invoiceId: { not: args.excludeInvoiceId } } : {}),
      },
      select: { sections: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    ctx.db.item.findMany({
      where: { organizationId: ctx.orgId },
      select: { id: true, name: true, rate: true },
    }),
  ]);

  const draft = await generateProposal({
    clientName: args.clientName,
    projectName: args.projectName,
    projectDescription: args.projectDescription,
    templateSections: template.sections as unknown as { key: string; title: string; content: string }[],
    pastProposals: pastProposals.map(
      (p) => p.sections as unknown as { key: string; title: string; content: string }[],
    ),
    items: items.map((i) => ({ id: i.id, name: i.name, rate: i.rate === null ? null : Number(i.rate) })),
  });

  return { draft };
}

export const proposalsRouter = router({
  // Unpaginated: returns all non-archived estimates for the org, newest first.
  // Acceptable for the proposals screen's scale; add pagination if an org's
  // estimate count grows large. (Fast-follow: an EmailEvent (invoiceId, type)
  // index would keep the grouped open-event lookup selective at scale.)
  list: protectedProcedure.query(async ({ ctx }) => {
    const estimates = await ctx.db.invoice.findMany({
      where: { organizationId: ctx.orgId, type: "ESTIMATE", isArchived: false },
      select: {
        id: true,
        number: true,
        notes: true,
        status: true,
        total: true,
        lastSent: true,
        signedAt: true,
        updatedAt: true,
        currency: { select: { code: true, symbol: true, symbolPosition: true } },
        client: { select: { name: true } },
        proposalContent: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // One grouped lookup for "opened" events across all estimates (avoids N+1).
    const ids = estimates.map((e) => e.id);
    const openEvents = ids.length
      ? await ctx.db.emailEvent.findMany({
          where: { organizationId: ctx.orgId, type: "email.opened", invoiceId: { in: ids } },
          select: { invoiceId: true },
        })
      : [];
    const openedIds = new Set(openEvents.map((e) => e.invoiceId));

    return estimates.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.notes ?? null,
      clientName: e.client.name,
      value: e.total.toNumber(),
      currencyCode: e.currency?.code ?? null,
      currencySymbol: e.currency?.symbol ?? null,
      currencySymbolPosition: e.currency?.symbolPosition ?? "before",
      lastActivity: e.updatedAt,
      status: deriveProposalStatus({
        hasContent: e.proposalContent != null,
        invoiceStatus: e.status,
        lastSent: e.lastSent,
        signedAt: e.signedAt,
        hasOpenEvent: openedIds.has(e.id),
      }),
    }));
  }),

  get: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
        include: { template: { select: { id: true, name: true } } },
      });
      return proposal;
    }),

  // Email engagement timeline (delivery/open/click events) for one proposal.
  // Estimates send through the same `invoice_id`-tagged path as invoices, so the
  // Resend webhook already attributes events to the estimate's id — this just
  // surfaces them. Mirrors invoices.getEmailEvents, scoped to ESTIMATE type.
  getEngagementEvents: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const estimate = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId, type: "ESTIMATE" },
        select: { id: true },
      });
      if (!estimate) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.emailEvent.findMany({
        where: { invoiceId: input.invoiceId },
        select: { id: true, type: true, occurredAt: true, recipient: true, link: true },
        orderBy: { occurredAt: "asc" },
      });
    }),

  create: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        invoiceId: z.string(),
        templateId: z.string().optional(),
        sections: proposalSectionsSchema.optional(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the invoice is an ESTIMATE owned by this org
      const invoice = await ctx.db.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: ctx.orgId,
          type: "ESTIMATE",
        },
      });
      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estimate not found",
        });
      }

      // Check no existing proposal
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Proposal already exists for this estimate",
        });
      }

      // If templateId provided, load template sections as defaults
      let sections = input.sections;
      if (!sections && input.templateId) {
        const template = await ctx.db.proposalTemplate.findFirst({
          where: { id: input.templateId, organizationId: ctx.orgId },
        });
        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Template not found",
          });
        }
        sections = template.sections as unknown as typeof sections;
      }

      // If still no sections, try org default template
      if (!sections) {
        const defaultTemplate = await ctx.db.proposalTemplate.findFirst({
          where: { organizationId: ctx.orgId, isDefault: true },
        });
        if (defaultTemplate) {
          sections = defaultTemplate.sections as unknown as typeof sections;
        }
      }

      if (!sections) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No sections provided and no default template found",
        });
      }

      return ctx.db.proposalContent.create({
        data: {
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
          templateId: input.templateId ?? null,
          sections,
          version: input.version ?? "1.0",
        },
      });
    }),

  update: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(
      z.object({
        invoiceId: z.string(),
        sections: proposalSectionsSchema.optional(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.proposalContent.update({
        where: { id: existing.id },
        data: {
          ...(input.sections !== undefined && { sections: input.sections }),
          ...(input.version !== undefined && { version: input.version }),
        },
      });
    }),

  delete: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalContent.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Clean up uploaded file from storage if present
      if (existing.fileUrl) {
        await deleteProposalFile(existing.fileUrl);
      }

      await ctx.db.proposalContent.delete({ where: { id: existing.id } });
      return { success: true };
    }),

  generate: requireRole("OWNER", "ADMIN", "ACCOUNTANT")
    .input(z.object({ invoiceId: z.string(), templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId, type: "ESTIMATE" },
        select: {
          id: true,
          client: {
            select: { name: true, projects: { select: { name: true, description: true }, take: 1 } },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Estimate not found" });
      const project = invoice.client.projects[0];
      return buildProposalDraft(ctx, {
        clientName: invoice.client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateId: input.templateId,
        excludeInvoiceId: input.invoiceId,
      });
    }),

  generateDraft: requireRole("OWNER", "ADMIN")
    .input(z.object({ clientId: z.string(), projectId: z.string().optional(), templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId, organizationId: ctx.orgId },
        select: { id: true, name: true },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      let project: { name: string; description: string | null } | null = null;
      if (input.projectId) {
        project = await ctx.db.project.findFirst({
          where: { id: input.projectId, organizationId: ctx.orgId, clientId: input.clientId },
          select: { name: true, description: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return buildProposalDraft(ctx, {
        clientName: client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateId: input.templateId,
      });
    }),

  // Wizard entry point: create the backing ESTIMATE + its ProposalContent in one
  // transaction. Scoped duplicate of invoices.create's estimate path (no partial
  // payments / credit balance / recurring) — keep money math in sync with invoices.create.
  createFromWizard: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        clientId: z.string().min(1),
        projectId: z.string().nullable().optional(),
        templateId: z.string().optional(),
        sections: proposalSectionsSchema,
        lineItems: z.array(wizardLineSchema).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true, stripeTaxEnabled: true, addressLine1: true, addressLine2: true,
          city: true, state: true, postalCode: true, country: true,
        },
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      await assertInOrg(ctx.db.client, input.clientId, ctx.orgId, { entityName: "Client" });
      if (input.projectId) {
        await assertInOrg(ctx.db.project, input.projectId, ctx.orgId, { entityName: "Project" });
      }

      // Org default currency, mirroring InvoiceForm's currencies[0] fallback.
      const currency =
        (await ctx.db.currency.findFirst({ where: { organizationId: ctx.orgId, isDefault: true } })) ??
        (await ctx.db.currency.findFirst({ where: { organizationId: ctx.orgId } }));
      if (!currency)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No currency configured for this organization" });

      const taxMap = await getOrgTaxMap(ctx.db as unknown as PrismaClient, ctx.orgId);
      const resolved = await resolveInvoiceTax({
        db: ctx.db as unknown as PrismaClient,
        org,
        clientId: input.clientId,
        currencyId: currency.id,
        lines: input.lineItems.map((l, i) => ({
          reference: String(i),
          qty: l.qty,
          rate: l.rate,
          period: undefined,
          lineType: LineType.STANDARD,
          discount: 0,
          discountIsPercentage: false,
          taxIds: [],
        })),
        discountType: null,
        discountAmount: 0,
        taxMap,
      });

      const invoiceId = await ctx.db.$transaction(async (tx: Prisma.TransactionClient) => {
        const txClient = tx as unknown as PrismaClient;
        const number = await generateInvoiceNumber(txClient, ctx.orgId);
        const created = await tx.invoice.create({
          data: {
            number,
            type: InvoiceType.ESTIMATE,
            status: InvoiceStatus.DRAFT,
            date: new Date(),
            currencyId: currency.id,
            exchangeRate: 1,
            // Intentionally NOT setting `notes` from a user-entered title: invoice.notes
            // renders on the client-facing estimate PDF (see pdf-templates/*.tsx), so a
            // free-text proposal title would leak. The proposal is identified by its
            // estimate number + client name in the list/detail views instead.
            clientId: input.clientId,
            projectId: input.projectId ?? null,
            organizationId: ctx.orgId,
            portalToken: generatePortalToken(),
            subtotal: resolved.invoice.subtotal,
            discountTotal: resolved.invoice.discountTotal,
            taxTotal: resolved.invoice.taxTotal,
            total: resolved.invoice.total,
            stripeTaxCalculationId: resolved.invoice.stripeTaxCalculationId,
            lines: {
              create: input.lineItems.map((line, i) => {
                const r = resolved.lines[i];
                return {
                  sort: i,
                  lineType: LineType.STANDARD,
                  name: line.name,
                  qty: line.qty,
                  rate: line.rate,
                  discount: 0,
                  discountIsPercentage: false,
                  sourceTable: line.sourceId ? "Item" : undefined,
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
        });

        await tx.proposalContent.create({
          data: {
            invoiceId: created.id,
            organizationId: ctx.orgId,
            templateId: input.templateId ?? null,
            sections: input.sections as Prisma.InputJsonValue,
            version: "1.0",
          },
        });

        return created.id;
      });

      return { invoiceId };
    }),
});
