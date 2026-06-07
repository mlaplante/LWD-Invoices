import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { idInput } from "../lib/schemas";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema, validateSections } from "./proposal-templates-helpers";
import { getProposalTemplatesForOrg, invalidateOrg } from "../cached";

export const proposalTemplatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getProposalTemplatesForOrg(ctx.db, ctx.orgId);
  }),

  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const template = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      sections: proposalSectionsSchema,
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!validateSections(input.sections)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await ctx.db.proposalTemplate.create({
        data: {
          name: input.name,
          sections: input.sections,
          isDefault: input.isDefault ?? false,
          organizationId: ctx.orgId,
        },
      });
      invalidateOrg(ctx.orgId, "proposalTemplates");
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      sections: proposalSectionsSchema.optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.sections && !validateSections(input.sections)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await ctx.db.proposalTemplate.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.sections !== undefined && { sections: input.sections }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });
      invalidateOrg(ctx.orgId, "proposalTemplates");
      return updated;
    }),

  delete: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.proposalTemplate.delete({ where: { id: input.id, organizationId: ctx.orgId } });
      invalidateOrg(ctx.orgId, "proposalTemplates");
      return { success: true };
    }),
});
