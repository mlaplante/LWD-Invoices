import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema } from "./proposal-templates-helpers";
import { deleteProposalFile } from "@/lib/supabase/storage";
import { generateProposal } from "@/server/services/proposal-generator";

export const proposalsRouter = router({
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

  create: protectedProcedure
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

  update: protectedProcedure
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

  delete: protectedProcedure
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
            select: {
              name: true,
              projects: { select: { name: true, description: true }, take: 1 },
            },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Estimate not found" });

      // Template sections: explicit templateId → org default. The template owns the section structure.
      const template = await ctx.db.proposalTemplate.findFirst({
        where: input.templateId
          ? { id: input.templateId, organizationId: ctx.orgId }
          : { organizationId: ctx.orgId, isDefault: true },
      });
      if (!template)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No template available to generate from" });

      const [pastProposals, items] = await Promise.all([
        ctx.db.proposalContent.findMany({
          where: { organizationId: ctx.orgId, invoiceId: { not: input.invoiceId } },
          select: { sections: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        ctx.db.item.findMany({
          where: { organizationId: ctx.orgId },
          select: { id: true, name: true, rate: true },
        }),
      ]);

      const project = invoice.client.projects[0];
      const draft = await generateProposal({
        clientName: invoice.client.name,
        projectName: project?.name ?? null,
        projectDescription: project?.description ?? null,
        templateSections: template.sections as unknown as { key: string; title: string; content: string }[],
        pastProposals: pastProposals.map(
          (p) => p.sections as unknown as { key: string; title: string; content: string }[],
        ),
        items: items.map((i) => ({ id: i.id, name: i.name, rate: i.rate === null ? null : Number(i.rate) })),
      });

      return { draft };
    }),
});
