import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { RecurringFrequency } from "@/generated/prisma";

const recurringSchema = z.object({
  frequency: z.nativeEnum(RecurringFrequency),
  interval: z.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  autoSend: z.boolean().default(false),
});

export const recurringInvoicesRouter = router({
  getForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringInvoice.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: org.id },
      });
    }),

  upsert: protectedProcedure
    .input(z.object({ invoiceId: z.string(), data: recurringSchema }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify invoice belongs to org
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: org.id },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.recurringInvoice.upsert({
        where: { invoiceId: input.invoiceId },
        create: {
          ...input.data,
          invoiceId: input.invoiceId,
          organizationId: org.id,
          nextRunAt: input.data.startDate,
        },
        update: {
          ...input.data,
          nextRunAt: input.data.startDate,
        },
      });
    }),

  cancel: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findFirst({ where: { clerkId: ctx.orgId } });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.recurringInvoice.updateMany({
        where: { invoiceId: input.invoiceId, organizationId: org.id },
        data: { isActive: false },
      });
    }),
});
