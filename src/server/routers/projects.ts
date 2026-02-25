import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { ProjectStatus } from "@/generated/prisma";

const projectWriteSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  clientId: z.string().min(1),
  currencyId: z.string().min(1),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  dueDate: z.coerce.date().optional(),
  rate: z.number().default(0),
  projectedHours: z.number().default(0),
  isFlatRate: z.boolean().default(false),
  isViewable: z.boolean().default(false),
  isTimesheetViewable: z.boolean().default(false),
});

const fullProjectInclude = {
  client: { select: { id: true, name: true } },
  currency: { select: { id: true, symbol: true, symbolPosition: true, code: true } },
  milestones: { orderBy: { sortOrder: "asc" as const } },
  tasks: {
    include: {
      taskStatus: true,
      milestone: true,
      timer: true,
      children: {
        include: {
          taskStatus: true,
          milestone: true,
          timer: true,
        },
        orderBy: { sortOrder: "asc" as const },
      },
    },
    where: { parentId: null },
    orderBy: { sortOrder: "asc" as const },
  },
  _count: {
    select: {
      tasks: true,
      timeEntries: true,
      expenses: true,
    },
  },
};

export const projectsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(ProjectStatus).optional(),
        clientId: z.string().optional(),
        includeArchived: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.project.findMany({
        where: {
          organizationId: ctx.orgId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(!input.includeArchived ? { status: { not: ProjectStatus.ARCHIVED } } : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          currency: { select: { id: true, symbol: true, symbolPosition: true } },
          _count: {
            select: { tasks: true, timeEntries: true, expenses: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Fetch project with flat task list for client-side tree building
      const project = await ctx.db.project.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          client: { select: { id: true, name: true } },
          currency: { select: { id: true, symbol: true, symbolPosition: true, code: true } },
          milestones: { orderBy: { sortOrder: "asc" } },
          tasks: {
            include: {
              taskStatus: true,
              milestone: true,
              timer: true,
              _count: { select: { timeEntries: true, children: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
          _count: { select: { tasks: true, timeEntries: true, expenses: true } },
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Compute summary totals
      const timeAgg = await ctx.db.timeEntry.aggregate({
        where: { projectId: input.id, organizationId: ctx.orgId },
        _sum: { minutes: true },
      });

      const expenseAgg = await ctx.db.expense.aggregate({
        where: { projectId: input.id, organizationId: ctx.orgId },
        _sum: { rate: true },
      });

      return {
        ...project,
        summary: {
          totalMinutes: timeAgg._sum.minutes?.toNumber() ?? 0,
          totalExpenses: expenseAgg._sum.rate?.toNumber() ?? 0,
        },
      };
    }),

  create: protectedProcedure
    .input(projectWriteSchema.extend({ templateId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { templateId, ...projectData } = input;

      return ctx.db.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { ...projectData, organizationId: ctx.orgId },
          include: fullProjectInclude,
        });

        if (templateId) {
          const template = await tx.projectTemplate.findUnique({
            where: { id: templateId, organizationId: ctx.orgId },
            include: { tasks: { orderBy: { sortOrder: "asc" } } },
          });

          if (template) {
            const sortOrderToId = new Map<number, string>();

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
                  projectId: project.id,
                  organizationId: ctx.orgId,
                },
              });

              sortOrderToId.set(templateTask.sortOrder, created.id);
            }
          }
        }

        return project;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(projectWriteSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.project.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.project.update({ where: { id, organizationId: ctx.orgId }, data });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string(), status: z.nativeEnum(ProjectStatus) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.project.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.project.update({
        where: { id: input.id, organizationId: ctx.orgId },
        data: { status: input.status },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.project.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Guard: no billed time entries
      const billedEntries = await ctx.db.timeEntry.count({
        where: {
          projectId: input.id,
          organizationId: ctx.orgId,
          invoiceLineId: { not: null },
        },
      });
      if (billedEntries > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a project with billed time entries.",
        });
      }

      return ctx.db.project.delete({ where: { id: input.id, organizationId: ctx.orgId } });
    }),
});
