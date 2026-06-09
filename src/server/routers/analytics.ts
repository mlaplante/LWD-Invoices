import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { buildWeeklyBriefing, resolveBriefingRecipients } from "@/server/services/weekly-briefing";
import { getAppUrl } from "@/lib/app-url";
import { calculateClientHealthScores, calculateClientHealthScore } from "@/server/services/client-health-score";
import {
  projectCashFlow,
  applyLatePaymentScenario,
  type LatePaymentScenario,
} from "@/server/services/cash-flow-forecast";
import { calculateSubscriptionMetrics } from "@/server/services/subscription-metrics";
import { detectExpenseAnomalies } from "@/server/services/expense-anomaly";
import { prioritizeCollections, scoreCollectionRisk } from "@/server/services/collection-risk";
import {
  buildClientHealthInputs,
  buildClientHealthInputForClient,
  buildCashFlowForecastInput,
  buildSubscriptionStreams,
  buildExpenseAnomalyInputs,
  buildCollectionRiskInputs,
  buildSendObservations,
} from "@/server/services/analytics-data";
import { recommendSendWindow } from "@/server/services/send-timing";
import { getBenchmarksForOrg } from "@/server/services/benchmarking-data";

export const analyticsRouter = router({
  // Anonymized cross-tenant benchmark: how this org's DSO / overdue share
  // compares to similar-sized businesses. The output is aggregate + k-anonymized
  // (no peer identities or raw values), so it's safe for any org member — and
  // keeps parity with the rest of the AR/DSO dashboard it renders on.
  benchmarks: protectedProcedure.query(async ({ ctx }) => {
    return getBenchmarksForOrg(ctx.db, ctx.orgId, new Date());
  }),

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

  // Per-open-invoice payment probability (the positive framing of collection
  // risk) for the invoice badge + detail breakdown. Returns a map keyed by
  // invoiceId so the UI can look up a single invoice without re-scoring.
  paymentProbability: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { smartRemindersThreshold: true },
    });
    const threshold = org?.smartRemindersThreshold ?? 80;
    const inputs = await buildCollectionRiskInputs(ctx.db, ctx.orgId, now, threshold);
    const invoices = inputs.map((input) => {
      const score = scoreCollectionRisk(input);
      return {
        invoiceId: score.invoiceId,
        invoiceNumber: score.invoiceNumber,
        clientName: score.clientName,
        balance: score.balance,
        paymentProbabilityPercent: score.paymentProbabilityPercent,
        paymentProbabilityBand: score.paymentProbabilityBand,
        reasons: score.reasons,
      };
    });
    const byInvoiceId: Record<string, (typeof invoices)[number]> = {};
    for (const inv of invoices) byInvoiceId[inv.invoiceId] = inv;
    return { generatedAt: now.toISOString(), invoices, byInvoiceId };
  }),

  // Recommended send window (weekday + time of day) for a client's invoice
  // emails, learned from when their past sends got opened. Falls back to a
  // global default when the client lacks enough history.
  bestSendWindow: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const observations = await buildSendObservations(ctx.db, ctx.orgId, input.clientId);
      return recommendSendWindow(observations);
    }),

  // Live preview of the weekly business briefing (same payload the Monday cron
  // emails) — powers the settings preview + the in-app briefing surface.
  weeklyBriefing: protectedProcedure.query(async ({ ctx }) => {
    return buildWeeklyBriefing(ctx.db, ctx.orgId, new Date());
  }),

  // Send the briefing to the configured recipients right now (or admin fallback).
  // Useful to test delivery without waiting for Monday.
  sendWeeklyBriefingNow: requireRole("OWNER", "ADMIN").mutation(async ({ ctx }) => {
    const now = new Date();
    const org = await ctx.db.organization.findUnique({
      where: { id: ctx.orgId },
      select: {
        name: true,
        logoUrl: true,
        brandColor: true,
        hidePoweredBy: true,
        weeklyBriefingRecipients: true,
      },
    });
    if (!org) throw new Error("Organization not found");

    const recipients = await resolveBriefingRecipients(ctx.db, ctx.orgId, org.weeklyBriefingRecipients);
    if (recipients.length === 0) {
      return { sent: false as const, reason: "no_recipients" as const };
    }

    const data = await buildWeeklyBriefing(ctx.db, ctx.orgId, now);
    const appUrl = await getAppUrl();

    const { render } = await import("@react-email/render");
    const { WeeklyBriefingEmail } = await import("@/emails/WeeklyBriefingEmail");
    const { format } = await import("date-fns");
    const { sendEmail } = await import("@/server/services/email-sender");

    const html = await render(
      WeeklyBriefingEmail({
        orgName: data.orgName,
        logoUrl: org.logoUrl ?? undefined,
        brandColor: org.brandColor ?? undefined,
        hidePoweredBy: org.hidePoweredBy,
        appUrl,
        currencySymbol: data.currencySymbol,
        headline: data.headline,
        overdue: data.overdue,
        atRiskClients: data.atRiskClients,
        forecast: data.forecast,
        collections: data.collections,
        periodLabel: `Week of ${format(now, "MMM d, yyyy")}`,
      }),
    );

    await sendEmail({
      organizationId: ctx.orgId,
      to: recipients,
      subject: `Your weekly briefing — ${data.headline}`,
      html,
    });

    await ctx.db.organization.update({
      where: { id: ctx.orgId },
      data: { weeklyBriefingLastSentAt: now },
    });

    return { sent: true as const, recipients: recipients.length };
  }),
});
