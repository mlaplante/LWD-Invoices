import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole, protectedProcedure } from "../trpc";

const stepSchema = z.object({
  daysRelativeToDue: z.number().int().min(-90).max(365),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  sort: z.number().int().default(0),
});

export const reminderSequencesRouter = router({
  list: requireRole("OWNER", "ADMIN")
    .query(async ({ ctx }) => {
      return ctx.db.reminderSequence.findMany({
        where: { organizationId: ctx.orgId },
        include: {
          steps: { orderBy: { sort: "asc" } },
          _count: { select: { invoices: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const sequence = await ctx.db.reminderSequence.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
        include: {
          steps: {
            orderBy: { sort: "asc" },
            include: {
              _count: { select: { logs: true } },
            },
          },
        },
      });
      if (!sequence) throw new TRPCError({ code: "NOT_FOUND" });
      return sequence;
    }),

  create: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        name: z.string().min(1).max(100),
        isDefault: z.boolean().default(false),
        enabled: z.boolean().default(true),
        steps: z.array(stepSchema).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        // If setting as default, unset other defaults
        if (input.isDefault) {
          await tx.reminderSequence.updateMany({
            where: { organizationId: ctx.orgId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.reminderSequence.create({
          data: {
            name: input.name,
            isDefault: input.isDefault,
            enabled: input.enabled,
            organizationId: ctx.orgId,
            steps: {
              create: input.steps.map((step, i) => ({
                daysRelativeToDue: step.daysRelativeToDue,
                subject: step.subject,
                body: step.body,
                sort: step.sort ?? i,
              })),
            },
          },
          include: { steps: { orderBy: { sort: "asc" } } },
        });
      });
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        isDefault: z.boolean().optional(),
        enabled: z.boolean().optional(),
        steps: z.array(stepSchema).min(1).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, steps, ...data } = input;
      const existing = await ctx.db.reminderSequence.findFirst({
        where: { id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.reminderSequence.updateMany({
            where: { organizationId: ctx.orgId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        if (steps) {
          // Delete old steps and create new ones
          await tx.reminderStep.deleteMany({ where: { sequenceId: id } });
          await tx.reminderStep.createMany({
            data: steps.map((step, i) => ({
              sequenceId: id,
              daysRelativeToDue: step.daysRelativeToDue,
              subject: step.subject,
              body: step.body,
              sort: step.sort ?? i,
            })),
          });
        }

        return tx.reminderSequence.update({
          where: { id },
          data,
          include: { steps: { orderBy: { sort: "asc" } } },
        });
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.reminderSequence.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Clear references from invoices
      await ctx.db.invoice.updateMany({
        where: { reminderSequenceId: input.id },
        data: { reminderSequenceId: null },
      });

      await ctx.db.reminderSequence.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Get reminder history for a specific invoice
  getInvoiceLogs: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify invoice belongs to this org
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.reminderLog.findMany({
        where: { invoiceId: input.invoiceId },
        include: {
          step: {
            select: { daysRelativeToDue: true, subject: true, sequence: { select: { name: true } } },
          },
        },
        orderBy: { sentAt: "desc" },
      });
    }),
});
