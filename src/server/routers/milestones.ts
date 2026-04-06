import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { generateInvoiceNumber } from "../services/invoice-numbering";

export const milestonesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.milestone.findMany({
        where: { projectId: input.projectId, organizationId: ctx.orgId },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().default("#3b82f6"),
        targetDate: z.coerce.date().optional(),
        sortOrder: z.number().int().default(0),
        isViewable: z.boolean().default(false),
        amount: z.coerce.number().positive().optional(),
        autoInvoice: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.milestone.create({
        data: { ...input, organizationId: ctx.orgId },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        targetDate: z.coerce.date().optional(),
        sortOrder: z.number().int().optional(),
        isViewable: z.boolean().optional(),
        amount: z.coerce.number().positive().optional().nullable(),
        autoInvoice: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.db.milestone.findUnique({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.milestone.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Null out milestoneId on tasks that reference this milestone
      await ctx.db.projectTask.updateMany({
        where: { milestoneId: input.id, organizationId: ctx.orgId },
        data: { milestoneId: null },
      });

      return ctx.db.milestone.delete({ where: { id: input.id } });
    }),

  reorder: protectedProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.map((id, index) =>
          ctx.db.milestone.updateMany({
            where: { id, organizationId: ctx.orgId },
            data: { sortOrder: index },
          })
        )
      );
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
        include: { project: { include: { client: true } } },
      });
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });
      if (milestone.completedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone already completed" });
      }

      if (milestone.autoInvoice && milestone.amount) {
        // Create draft invoice inside a transaction
        const result = await ctx.db.$transaction(async (tx) => {
          const number = await generateInvoiceNumber(tx as never, ctx.orgId);

          const defaultCurrency = await tx.currency.findFirst({
            where: { organizationId: ctx.orgId, isDefault: true },
          });
          if (!defaultCurrency) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No default currency configured" });

          const amt = Number(milestone.amount);

          const invoice = await tx.invoice.create({
            data: {
              number,
              type: "DETAILED",
              status: "DRAFT",
              date: new Date(),
              clientId: milestone.project.clientId,
              organizationId: ctx.orgId,
              currencyId: defaultCurrency.id,
              subtotal: amt,
              taxTotal: 0,
              discountTotal: 0,
              total: amt,
              lines: {
                create: {
                  sort: 0,
                  lineType: "STANDARD",
                  name: milestone.name,
                  description: `Milestone: ${milestone.name}`,
                  qty: 1,
                  rate: amt,
                  subtotal: amt,
                  taxTotal: 0,
                  total: amt,
                },
              },
            },
          });

          const updated = await tx.milestone.update({
            where: { id: input.id },
            data: { completedAt: new Date(), invoiceId: invoice.id },
          });

          await tx.auditLog.create({
            data: {
              action: "CREATED",
              entityType: "Invoice",
              entityId: invoice.id,
              entityLabel: invoice.number,
              organizationId: ctx.orgId,
              userId: ctx.userId,
            },
          });

          return { milestone: updated, invoice };
        });

        return result.milestone;
      }

      // No auto-invoice — just mark complete
      return ctx.db.milestone.update({
        where: { id: input.id },
        data: { completedAt: new Date() },
      });
    }),

  reopen: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const milestone = await ctx.db.milestone.findUnique({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });
      if (!milestone.completedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone is not completed" });
      }
      return ctx.db.milestone.update({
        where: { id: input.id },
        data: { completedAt: null },
      });
    }),
});
