import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { calculateClientHealthScores, calculateClientHealthScore } from "@/server/services/client-health-score";
import {
  projectCashFlow,
  applyLatePaymentScenario,
  type LatePaymentScenario,
} from "@/server/services/cash-flow-forecast";
import { calculateSubscriptionMetrics } from "@/server/services/subscription-metrics";
import { detectExpenseAnomalies } from "@/server/services/expense-anomaly";
import { prioritizeCollections } from "@/server/services/collection-risk";
import {
  buildClientHealthInputs,
  buildClientHealthInputForClient,
  buildCashFlowForecastInput,
  buildSubscriptionStreams,
  buildExpenseAnomalyInputs,
  buildCollectionRiskInputs,
} from "@/server/services/analytics-data";

export const analyticsRouter = router({
  // Composite per-client health scores (payment, engagement, revenue, overdue).
  clientHealth: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const inputs = await buildClientHealthInputs(ctx.db, ctx.orgId, now);
    return { generatedAt: now.toISOString(), scores: calculateClientHealthScores(inputs) };
  }),

  // Health score for a single client (client-detail badge). Returns null when
  // the client has no invoices to score yet.
  clientHealthForClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const built = await buildClientHealthInputForClient(ctx.db, ctx.orgId, input.clientId, now);
      if (!built) return { score: null };
      return { score: calculateClientHealthScore(built) };
    }),

  // Forward 30/60/90-day cash position with optional late-payment scenarios.
  cashFlowForecast: protectedProcedure
    .input(
      z
        .object({
          startingCash: z.number().optional(),
          scenarios: z
            .array(
              z.object({
                clientId: z.string(),
                clientName: z.string(),
                delayDays: z.number().int().min(1).max(365),
              }),
            )
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const forecastInput = await buildCashFlowForecastInput(ctx.db, ctx.orgId, input?.startingCash);
      const scenarios = (input?.scenarios ?? []) as LatePaymentScenario[];
      const base = projectCashFlow(forecastInput, { now });
      const scenario =
        scenarios.length > 0 ? applyLatePaymentScenario(forecastInput, scenarios, { now }) : null;
      return { base, scenario, appliedScenarios: scenarios };
    }),

  // MRR / ARR / ARPA and revenue/logo churn over the recurring-revenue book.
  subscriptionMetrics: protectedProcedure
    .input(z.object({ periodDays: z.number().int().min(7).max(365).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const streams = await buildSubscriptionStreams(ctx.db, ctx.orgId);
      return calculateSubscriptionMetrics(streams, { now, periodDays: input?.periodDays });
    }),

  // Duplicate-receipt + amount-outlier detection over recent expenses.
  expenseAnomalies: protectedProcedure
    .input(z.object({ lookbackDays: z.number().int().min(30).max(730).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const inputs = await buildExpenseAnomalyInputs(ctx.db, ctx.orgId, input?.lookbackDays);
      return detectExpenseAnomalies(inputs, { now });
    }),

  // Predictive collections / dunning queue ranked by late-payment risk.
  collectionsRisk: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { smartRemindersThreshold: true },
    });
    const threshold = org?.smartRemindersThreshold ?? 80;
    const inputs = await buildCollectionRiskInputs(ctx.db, ctx.orgId, now, threshold);
    return {
      generatedAt: now.toISOString(),
      reliablePayerThreshold: threshold,
      invoices: prioritizeCollections(inputs),
    };
  }),
});
