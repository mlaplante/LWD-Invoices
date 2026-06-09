import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { WIDGET_KEYS, normalizeLayout } from "@/lib/dashboard-layout";

const layoutEntrySchema = z.object({
  key: z.enum(WIDGET_KEYS),
  visible: z.boolean(),
});

export const dashboardLayoutRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const pref = await ctx.db.userDashboardPreference.findUnique({
      where: { userId_organizationId: { userId: ctx.userId!, organizationId: ctx.orgId! } },
      select: { layoutJson: true },
    });
    let saved: Array<{ key: string; visible: boolean }> = [];
    if (pref?.layoutJson) {
      try { saved = JSON.parse(pref.layoutJson); } catch { saved = []; }
    }
    return normalizeLayout(saved);
  }),

  save: protectedProcedure
    .input(z.object({ layout: z.array(layoutEntrySchema).max(WIDGET_KEYS.length) }))
    .mutation(async ({ ctx, input }) => {
      const layoutJson = JSON.stringify(normalizeLayout(input.layout));
      await ctx.db.userDashboardPreference.upsert({
        where: { userId_organizationId: { userId: ctx.userId!, organizationId: ctx.orgId! } },
        create: { userId: ctx.userId!, organizationId: ctx.orgId!, layoutJson },
        update: { layoutJson },
      });
      return { ok: true };
    }),
});
