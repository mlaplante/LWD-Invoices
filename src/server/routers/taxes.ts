import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { invalidateOrg } from "../cached";

const taxSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isCompound: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const taxesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.tax.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
    });
  }),

  create: requireRole("OWNER", "ADMIN")
    .input(taxSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.tax.create({
        data: { ...input, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "taxes");
      return result;
    }),

  update: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }).merge(taxSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const result = await ctx.db.tax.update({
        where: { id, organizationId: ctx.orgId },
        data,
      });
      invalidateOrg(ctx.orgId, "taxes");
      return result;
    }),

  delete: requireRole("OWNER", "ADMIN")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.tax.delete({
        where: { id: input.id, organizationId: ctx.orgId },
      });
      invalidateOrg(ctx.orgId, "taxes");

      // Fan out a recalc job — open invoices that referenced this tax
      // need their cached totals refreshed so dashboard/reports stay
      // accurate. Best-effort: a failure here is logged, not surfaced.
      try {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          name: "org/tax.deleted",
          data: { orgId: ctx.orgId, taxId: input.id },
        });
      } catch (err) {
        console.error("[taxes.delete] Failed to enqueue recalc job:", err);
      }

      return result;
    }),
});
