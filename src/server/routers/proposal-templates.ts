import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { proposalSectionsSchema, validateSections } from "./proposal-templates-helpers";

export const proposalTemplatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.proposalTemplate.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
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
      if (!validateSections(input.sections as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.proposalTemplate.create({
        data: {
          name: input.name,
          sections: input.sections,
          isDefault: input.isDefault ?? false,
          organizationId: ctx.orgId,
        },
      });
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

      if (input.sections && !validateSections(input.sections as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate section keys" });
      }

      if (input.isDefault) {
        await ctx.db.proposalTemplate.updateMany({
          where: { organizationId: ctx.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.proposalTemplate.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.sections !== undefined && { sections: input.sections }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.proposalTemplate.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.proposalTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
