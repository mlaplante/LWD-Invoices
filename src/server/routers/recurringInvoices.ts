import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, requireRole } from "../trpc";
import { RecurringFrequency } from "@/generated/prisma";

const recurringSchema = z.object({
  frequency: z.nativeEnum(RecurringFrequency),
  interval: z.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  autoSend: z.boolean().default(false),
  // 1-31; clamped to the last day of short months at run time.
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  // IANA timezone string, validated lazily by Intl.DateTimeFormat at
  // schedule time so we don't need to ship a country/zone allowlist.
  timezone: z
    .string()
    .max(64)
    .optional()
    .refine(
      (tz) => {
        if (!tz) return true;
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid IANA timezone" },
    ),
});

export const recurringInvoicesRouter = router({
  getForInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.recurringInvoice.findFirst({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
      });
    }),

  upsert: requireRole("OWNER", "ADMIN")
    .input(z.object({ invoiceId: z.string(), data: recurringSchema }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.invoiceId, organizationId: ctx.orgId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const now = new Date();
      return ctx.db.recurringInvoice.upsert({
        where: { invoiceId: input.invoiceId },
        create: {
          ...input.data,
          invoiceId: input.invoiceId,
          organizationId: ctx.orgId,
          nextRunAt: input.data.startDate,
        },
        update: {
          ...input.data,
          // Only reset nextRunAt if startDate is in the future — otherwise
          // keep the existing schedule to avoid re-firing an already-started run
          ...(input.data.startDate > now ? { nextRunAt: input.data.startDate } : {}),
        },
      });
    }),

  cancel: requireRole("OWNER", "ADMIN")
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.recurringInvoice.updateMany({
        where: { invoiceId: input.invoiceId, organizationId: ctx.orgId },
        data: { isActive: false },
      });
    }),
});
