import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const templateTaskSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
  projectedHours: z.number().default(0),
  rate: z.number().default(0),
  parentSortOrder: z.number().int().optional(),
});

export const projectTemplatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.projectTemplate.findMany({
      where: { organizationId: ctx.orgId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.db.projectTemplate.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        tasks: z.array(templateTaskSchema).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.projectTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          organizationId: ctx.orgId,
          tasks: {
            create: input.tasks.map((t) => ({
              name: t.name,
              notes: t.notes,
              sortOrder: t.sortOrder,
              projectedHours: t.projectedHours,
              rate: t.rate,
              parentSortOrder: t.parentSortOrder,
            })),
          },
        },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        tasks: z.array(templateTaskSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.projectTemplate.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, tasks, ...rest } = input;

      return ctx.db.$transaction(async (tx) => {
        if (tasks !== undefined) {
          await tx.projectTemplateTask.deleteMany({ where: { templateId: id } });
        }

        return tx.projectTemplate.update({
          where: { id },
          data: {
            ...rest,
            ...(tasks !== undefined
              ? {
                  tasks: {
                    create: tasks.map((t) => ({
                      name: t.name,
                      notes: t.notes,
                      sortOrder: t.sortOrder,
                      projectedHours: t.projectedHours,
                      rate: t.rate,
                      parentSortOrder: t.parentSortOrder,
                    })),
                  },
                }
              : {}),
          },
          include: { tasks: { orderBy: { sortOrder: "asc" } } },
        });
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.projectTemplate.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.projectTemplate.delete({ where: { id: input.id } });
    }),

  applyToProject: protectedProcedure
    .input(z.object({ templateId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.projectTemplate.findUnique({
        where: { id: input.templateId, organizationId: ctx.orgId },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId, organizationId: ctx.orgId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Build tasks in order, tracking sortOrder → new task id for parent hierarchy
      const sortOrderToId = new Map<number, string>();

      await ctx.db.$transaction(async (tx) => {
        for (const templateTask of template.tasks) {
          const parentId =
            templateTask.parentSortOrder !== null && templateTask.parentSortOrder !== undefined
              ? (sortOrderToId.get(templateTask.parentSortOrder) ?? null)
              : null;

          const created = await tx.projectTask.create({
            data: {
              name: templateTask.name,
              notes: templateTask.notes,
              sortOrder: templateTask.sortOrder,
              projectedHours: templateTask.projectedHours,
              rate: templateTask.rate,
              parentId,
              projectId: input.projectId,
              organizationId: ctx.orgId,
            },
          });

          sortOrderToId.set(templateTask.sortOrder, created.id);
        }
      });
    }),
});
