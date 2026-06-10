import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requireRole, protectedProcedure } from "../trpc";
import { idInput } from "../lib/schemas";
import { generateSmartReminderDraft } from "@/server/services/smart-reminder-drafts";
import { getClientPaymentBehaviorSummary } from "@/server/services/client-payment-score";

const stepSchema = z.object({
  trigger: z.enum(["DUE_DATE_OFFSET", "VIEWED_UNPAID"]).default("DUE_DATE_OFFSET"),
  daysRelativeToDue: z.number().int().min(-90).max(365),
  // For VIEWED_UNPAID steps: hours after the first email open before nudging.
  viewedDelayHours: z.number().int().min(0).max(720).nullable().optional(),
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
    .input(idInput)
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
                trigger: step.trigger,
                daysRelativeToDue: step.daysRelativeToDue,
                viewedDelayHours: step.trigger === "VIEWED_UNPAID" ? step.viewedDelayHours ?? 24 : null,
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
          await tx.reminderStep.deleteMany({
            where: { sequenceId: id, sequence: { organizationId: ctx.orgId } },
          });
          await tx.reminderStep.createMany({
            data: steps.map((step, i) => ({
              sequenceId: id,
              trigger: step.trigger,
              daysRelativeToDue: step.daysRelativeToDue,
              viewedDelayHours: step.trigger === "VIEWED_UNPAID" ? step.viewedDelayHours ?? 24 : null,
              subject: step.subject,
              body: step.body,
              sort: step.sort ?? i,
            })),
          });
        }

        return tx.reminderSequence.update({
          where: { id, organizationId: ctx.orgId },
          data,
          include: { steps: { orderBy: { sort: "asc" } } },
        });
      });
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.reminderSequence.findFirst({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Clear references from invoices (org-scoped so a sequence id can never
      // null out another org's invoice references)
      await ctx.db.invoice.updateMany({
        where: { reminderSequenceId: input.id, organizationId: ctx.orgId },
        data: { reminderSequenceId: null },
      });

      await ctx.db.reminderSequence.delete({ where: { id: input.id, organizationId: ctx.orgId } });
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

  // Generate an AI-assisted draft for human review; this never sends email.
  generateDraft: requireRole("OWNER", "ADMIN")
    .input(z.object({ invoiceId: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        include: {
          client: { select: { id: true } },
          currency: { select: { code: true } },
          organization: { select: { name: true, smartRemindersThreshold: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (!invoice.dueDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice needs a due date before drafting a reminder" });
      }

      const step = await ctx.db.reminderStep.findFirst({
        where: {
          id: input.stepId,
          sequence: { organizationId: ctx.orgId },
        },
        select: { subject: true, body: true },
      });
      if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "Reminder step not found" });

      const paymentProfile = await getClientPaymentBehaviorSummary(ctx.db, invoice.client.id);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com";
      const now = new Date();
      const dueMidnight = Date.UTC(invoice.dueDate.getUTCFullYear(), invoice.dueDate.getUTCMonth(), invoice.dueDate.getUTCDate());
      const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

      return generateSmartReminderDraft({
        invoice: {
          invoiceNumber: invoice.number,
          amountDue: Number(invoice.total).toFixed(2),
          currencyCode: invoice.currency.code,
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          daysOverdue: Math.max(0, Math.round((nowMidnight - dueMidnight) / 86400000)),
          paymentUrl: `${appUrl}/portal/${invoice.portalToken}`,
        },
        template: step,
        organization: invoice.organization,
        paymentProfile,
        reliablePayerThreshold: invoice.organization.smartRemindersThreshold,
      });
    }),
});
