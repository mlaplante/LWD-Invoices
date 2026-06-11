import { z } from "zod";
import { router, protectedProcedure, requireRole } from "../trpc";
import { buildWeeklyBriefing, resolveBriefingRecipients } from "@/server/services/weekly-briefing";
import { getAppUrl } from "@/lib/app-url";
import { calculateClientHealthScores, calculateClientHealthScore } from "@/server/services/client-health-score";
import {
  projectCashFlow,
  applyScenarioPlan,
  type ScenarioPlan,
} from "@/server/services/cash-flow-forecast";
import { deriveRunway } from "@/server/services/runway";
import {
  describeBias,
  scoreSnapshot,
  summarizeAccuracy,
} from "@/server/services/forecast-accuracy";
import {
  buildProfitabilityInsights,
  type ProfitabilityRow,
} from "@/server/services/profitability-insights";
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
import { recommendSendWindow, nextSendWindowOccurrence } from "@/server/services/send-timing";
import { computeBudgetVsActual } from "@/server/services/expense-budgets";
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

  // Forward 30/60/90-day cash position with optional what-if scenarios:
  // late-paying clients, a contractor hire, and recurring-revenue churn.
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
          contractorHire: z
            .object({
              hourlyRate: z.number().positive().max(100_000),
              hoursPerPeriod: z.number().positive().max(1_000),
              frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
              interval: z.number().int().min(1).max(52).optional(),
            })
            .nullish(),
          churn: z
            .object({ churnPercent: z.number().min(0).max(100) })
            .nullish(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const forecastInput = await buildCashFlowForecastInput(ctx.db, ctx.orgId, input?.startingCash);
      const plan: ScenarioPlan = {
        latePayments: input?.scenarios ?? [],
        contractorHire: input?.contractorHire ?? null,
        churn: input?.churn ?? null,
      };
      const hasScenario =
        (plan.latePayments?.length ?? 0) > 0 || Boolean(plan.contractorHire) || Boolean(plan.churn);
      const base = projectCashFlow(forecastInput, { now });
      const scenario = hasScenario ? applyScenarioPlan(forecastInput, plan, { now }) : null;
      return { base, scenario, appliedPlan: plan };
    }),

  // Cash-margin profitability insights: per-client margin = revenue − (expenses
  // + attributable contractor pay), with the owner's own time counted as free.
  // This is a SEPARATE basis from /reports/profitability (which counts tracked
  // time at the billing rate); that report is intentionally left untouched.
  profitabilityInsights: protectedProcedure.query(async ({ ctx }) => {
    const [payments, expenses, contractorPayments, clients] = await Promise.all([
      ctx.db.payment.findMany({
        where: { organizationId: ctx.orgId },
        select: { amount: true, invoice: { select: { clientId: true } } },
      }),
      ctx.db.expense.findMany({
        where: { organizationId: ctx.orgId, project: { isNot: null } },
        select: { id: true, rate: true, qty: true, project: { select: { clientId: true } } },
      }),
      // ContractorPayment has no `expense` relation (only an expenseId), so pay
      // is attributed to a client by mapping its expenseId → the expense's
      // project client below; unlinked payments are counted org-wide.
      ctx.db.contractorPayment.findMany({
        where: { organizationId: ctx.orgId },
        select: { amount: true, expenseId: true },
      }),
      ctx.db.client.findMany({
        where: { organizationId: ctx.orgId },
        select: { id: true, name: true },
      }),
    ]);

    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const revenueByClient = new Map<string, number>();
    const costByClient = new Map<string, number>();
    const add = (map: Map<string, number>, key: string, amount: number) =>
      map.set(key, (map.get(key) ?? 0) + amount);

    for (const p of payments) {
      if (p.invoice.clientId) add(revenueByClient, p.invoice.clientId, Number(p.amount));
    }
    const expenseToClient = new Map<string, string>();
    for (const e of expenses) {
      if (e.project?.clientId) {
        add(costByClient, e.project.clientId, Number(e.rate) * e.qty);
        expenseToClient.set(e.id, e.project.clientId);
      }
    }
    let unattributedContractorCost = 0;
    for (const cp of contractorPayments) {
      const clientId = cp.expenseId ? expenseToClient.get(cp.expenseId) : undefined;
      if (clientId) add(costByClient, clientId, Number(cp.amount));
      else unattributedContractorCost += Number(cp.amount);
    }

    const ids = new Set([...revenueByClient.keys(), ...costByClient.keys()]);
    const rows: ProfitabilityRow[] = Array.from(ids).map((id) => {
      const revenue = Math.round((revenueByClient.get(id) ?? 0) * 100) / 100;
      const cost = Math.round((costByClient.get(id) ?? 0) * 100) / 100;
      const margin = Math.round((revenue - cost) * 100) / 100;
      return {
        id,
        name: clientName.get(id) ?? "Unknown",
        revenue,
        cost,
        margin,
        marginPercent: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
      };
    });
    rows.sort((a, b) => a.marginPercent - b.marginPercent);

    return {
      rows,
      insights: buildProfitabilityInsights(rows),
      unattributedContractorCost: Math.round(unattributedContractorCost * 100) / 100,
    };
  }),

  // Runway / burn summary: monthly burn + net-position trajectory over the
  // forecast horizon. No stored bank balance, so days-of-cash stays null unless
  // a starting balance is supplied.
  runway: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const forecastInput = await buildCashFlowForecastInput(ctx.db, ctx.orgId);
    const forecast = projectCashFlow(forecastInput, { now });
    return deriveRunway(forecastInput, forecast);
  }),

  // How well past cash-flow forecasts matched reality. Scored snapshots come
  // from the weekly forecast-snapshots cron; until the first 30-day window
  // closes this returns pending counts so the UI can explain the wait.
  forecastAccuracy: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - 1);

    const [scoredRows, pendingCount] = await Promise.all([
      ctx.db.forecastSnapshot.findMany({
        where: { organizationId: ctx.orgId, scoredAt: { not: null }, capturedAt: { gte: since } },
        orderBy: { capturedAt: "desc" },
        take: 200,
      }),
      ctx.db.forecastSnapshot.count({
        where: { organizationId: ctx.orgId, scoredAt: null },
      }),
    ]);

    const scored = scoredRows.map((row) => ({
      capturedAt: row.capturedAt,
      horizonDays: row.horizonDays,
      projectedInflow: row.projectedInflow.toNumber(),
      actualInflow: row.actualInflow?.toNumber() ?? 0,
    }));

    const summary = summarizeAccuracy(scored);
    return {
      summary,
      biasNote: describeBias(summary),
      pendingCount,
      // Most recent scored snapshots for the detail table (already desc).
      recent: scored.slice(0, 12).map((s) => ({
        ...s,
        ...scoreSnapshot(s.projectedInflow, s.actualInflow),
      })),
    };
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
      const org = await ctx.db.organization.findUnique({
        where: { id: ctx.orgId },
        select: { timeZone: true },
      });
      const timeZone = org?.timeZone ?? "UTC";
      const observations = await buildSendObservations(
        ctx.db,
        ctx.orgId,
        input.clientId,
        timeZone,
      );
      const recommendation = recommendSendWindow(observations);
      // Concrete future instant for the recommendation so the send dialog can
      // schedule it in one click instead of asking the user to come back.
      return {
        ...recommendation,
        nextOccurrence: nextSendWindowOccurrence(recommendation, timeZone).toISOString(),
        timeZone,
      };
    }),

  // Monthly expense budgets vs. month-to-date actuals (plus a straight-line
  // month-end projection) for the Money Intelligence hub. "Actual" buckets
  // each expense by paidAt ?? dueDate ?? createdAt.
  expenseBudgetVsActual: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const window = { gte: priorMonthStart, lt: nextMonthStart };

    const [budgets, expenses] = await Promise.all([
      ctx.db.expenseBudget.findMany({
        where: { organizationId: ctx.orgId },
        include: { category: { select: { name: true } } },
      }),
      ctx.db.expense.findMany({
        where: {
          organizationId: ctx.orgId,
          OR: [
            { paidAt: window },
            { paidAt: null, dueDate: window },
            { paidAt: null, dueDate: null, createdAt: window },
          ],
        },
        select: {
          categoryId: true,
          qty: true,
          rate: true,
          paidAt: true,
          dueDate: true,
          createdAt: true,
        },
      }),
    ]);

    const result = computeBudgetVsActual(
      budgets.map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.category?.name ?? null,
        monthlyAmount: Number(b.monthlyAmount),
      })),
      expenses.map((e) => ({
        categoryId: e.categoryId,
        amount: e.qty * Number(e.rate),
        date: e.paidAt ?? e.dueDate ?? e.createdAt,
      })),
      now,
    );

    return { generatedAt: now.toISOString(), monthStart: monthStart.toISOString(), ...result };
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
