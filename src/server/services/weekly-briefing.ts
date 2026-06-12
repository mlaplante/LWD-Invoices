/**
 * Proactive weekly business briefing.
 *
 * Composes the analytics cores you already ship into a single payload for the
 * Monday email, settings preview, dashboard widget, and report API.
 */

import type { db as Db } from "../db";
import {
  buildCashFlowForecastInput,
  buildClientHealthInputs,
  buildCollectionRiskInputs,
} from "./analytics-data";
import { projectCashFlow } from "./cash-flow-forecast";
import { calculateClientHealthScores } from "./client-health-score";
import { prioritizeCollections } from "./collection-risk";

export interface BriefingOverdueClient {
  clientId: string;
  clientName: string;
  amount: number;
}

export interface BriefingAtRiskClient {
  clientId: string;
  clientName: string;
  score: number;
  band: string;
  churnRiskPercent: number;
  headline: string;
}

export interface BriefingForecastHorizon {
  horizonDays: number;
  projectedInflow: number;
  projectedPosition: number;
  confidence: number;
}

export interface BriefingCollectionItem {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  balance: number;
  daysOverdue: number;
  recommendedAction: string;
}

export interface WeeklyBriefingData {
  generatedAt: string;
  orgName: string;
  currencySymbol: string;
  overdue: {
    total: number;
    count: number;
    topClients: BriefingOverdueClient[];
  };
  atRiskClients: BriefingAtRiskClient[];
  forecast: BriefingForecastHorizon[];
  collections: BriefingCollectionItem[];
  headline: string;
  isQuiet: boolean;
}

export interface WeeklyBriefingReportData {
  weekStart: Date;
  weekEnd: Date;
  cashIn: number;
  cashOut: number;
  overdueInvoiceRisk: {
    totalAmount: number;
    invoiceCount: number;
    maxOverdueDays: number;
  };
  expenseAnomalies: {
    totalAnomalies: number;
    items: Array<{ type: string; amount: number; description: string }>;
  };
  upcomingRenewals: Array<{ name: string; renewalDate: Date; amount: number }>;
  recommendations: Array<{
    type: string;
    priority: "high" | "medium" | "low";
    description: string;
  }>;
  generatedAt: Date;
  metadata: {
    aiProvider: string;
    modelUsed: string;
    hasAIError?: string;
  };
}

const AT_RISK_BANDS = new Set(["at_risk", "critical"]);
const ACTION_LABELS: Record<string, string> = {
  monitor: "Monitor",
  pre_due_nudge: "Send a pre-due nudge",
  reminder: "Send a reminder",
  firm_reminder: "Send a firm reminder",
  final_notice: "Send a final notice",
  escalate: "Escalate (call / collections)",
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(symbol: string, n: number): string {
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

export function briefingHeadline(data: {
  currencySymbol: string;
  overdueTotal: number;
  overdueCount: number;
  atRiskCount: number;
  projected30: number | null;
}): string {
  const parts: string[] = [];
  if (data.overdueCount > 0) {
    parts.push(
      `${money(data.currencySymbol, data.overdueTotal)} overdue across ${data.overdueCount} invoice${
        data.overdueCount === 1 ? "" : "s"
      }`,
    );
  } else {
    parts.push("nothing overdue");
  }
  if (data.atRiskCount > 0) {
    parts.push(`${data.atRiskCount} client${data.atRiskCount === 1 ? "" : "s"} at risk`);
  }
  if (data.projected30 !== null) {
    parts.push(`${money(data.currencySymbol, data.projected30)} projected to land in the next 30 days`);
  }
  const sentence = `${parts.join(", ")}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export async function buildWeeklyBriefing(
  db: typeof Db,
  orgId: string,
  now: Date = new Date(),
  options: { reliablePayerThreshold?: number } = {},
): Promise<WeeklyBriefingData> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      smartRemindersThreshold: true,
      currencies: {
        where: { isDefault: true },
        select: { symbol: true },
        take: 1,
      },
    },
  });
  const orgName = org?.name ?? "Your business";
  const currencySymbol = org?.currencies[0]?.symbol ?? "$";
  const threshold = options.reliablePayerThreshold ?? org?.smartRemindersThreshold ?? 80;

  const [healthInputs, forecastInput, collectionInputs] = await Promise.all([
    buildClientHealthInputs(db, orgId, now),
    buildCashFlowForecastInput(db, orgId),
    buildCollectionRiskInputs(db, orgId, now, threshold),
  ]);

  const healthScores = calculateClientHealthScores(healthInputs);
  const forecast = projectCashFlow(forecastInput, { now });
  const collections = prioritizeCollections(collectionInputs);

  const overdueItems = collections.filter((c) => c.daysOverdue > 0 && c.balance > 0);
  const overdueByClient = new Map<string, BriefingOverdueClient>();
  let overdueTotal = 0;
  for (const item of overdueItems) {
    overdueTotal += item.balance;
    const existing = overdueByClient.get(item.clientId) ?? {
      clientId: item.clientId,
      clientName: item.clientName,
      amount: 0,
    };
    existing.amount = round(existing.amount + item.balance);
    overdueByClient.set(item.clientId, existing);
  }

  const atRiskClients: BriefingAtRiskClient[] = healthScores
    .filter((s) => AT_RISK_BANDS.has(s.band))
    .slice(0, 5)
    .map((s) => ({
      clientId: s.clientId,
      clientName: s.clientName,
      score: s.score,
      band: s.band,
      churnRiskPercent: s.churnRiskPercent,
      headline:
        s.signals[0] ??
        (s.components.disputes.score < 40
          ? s.components.disputes.detail
          : s.components.payment.detail),
    }));

  const forecastHorizons: BriefingForecastHorizon[] = forecast.horizons.map((h) => ({
    horizonDays: h.horizonDays,
    projectedInflow: h.projectedInflow,
    projectedPosition: h.projectedPosition,
    confidence: h.confidence,
  }));

  const topCollections: BriefingCollectionItem[] = collections
    .filter((c) => c.actionDue)
    .slice(0, 6)
    .map((c) => ({
      invoiceId: c.invoiceId,
      invoiceNumber: c.invoiceNumber,
      clientName: c.clientName,
      balance: c.balance,
      daysOverdue: c.daysOverdue,
      recommendedAction: ACTION_LABELS[c.recommendedAction] ?? c.recommendedAction,
    }));

  const projected30 = forecastHorizons.find((h) => h.horizonDays === 30)?.projectedInflow ?? null;
  const headline = briefingHeadline({
    currencySymbol,
    overdueTotal: round(overdueTotal),
    overdueCount: overdueItems.length,
    atRiskCount: atRiskClients.length,
    projected30,
  });

  return {
    generatedAt: now.toISOString(),
    orgName,
    currencySymbol,
    overdue: {
      total: round(overdueTotal),
      count: overdueItems.length,
      topClients: Array.from(overdueByClient.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    },
    atRiskClients,
    forecast: forecastHorizons,
    collections: topCollections,
    headline,
    isQuiet: overdueItems.length === 0 && atRiskClients.length === 0 && topCollections.length === 0,
  };
}

export async function resolveBriefingRecipients(
  db: typeof Db,
  orgId: string,
  configured: string[],
): Promise<string[]> {
  if (configured.length > 0) {
    return Array.from(new Set(configured.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  }
  const members = await db.userOrganization.findMany({
    where: { organizationId: orgId, role: { in: ["OWNER", "ADMIN"] } },
    select: { user: { select: { email: true } } },
  });
  return Array.from(
    new Set(members.map((m) => m.user.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
  );
}

export async function getWeeklyBriefing(
  db: typeof Db,
  orgId: string,
  _aiApiKey = "",
  aiModels: string[] = [],
): Promise<WeeklyBriefingReportData> {
  void _aiApiKey;
  const now = new Date();
  const briefing = await buildWeeklyBriefing(db, orgId, now);
  const horizon30 = briefing.forecast.find((h) => h.horizonDays === 30);

  return {
    weekStart: new Date(now.getTime() - 7 * 86400000),
    weekEnd: now,
    cashIn: round(horizon30?.projectedInflow ?? 0),
    cashOut: 0,
    overdueInvoiceRisk: {
      totalAmount: briefing.overdue.total,
      invoiceCount: briefing.overdue.count,
      maxOverdueDays: Math.max(0, ...briefing.collections.map((c) => c.daysOverdue)),
    },
    expenseAnomalies: { totalAnomalies: 0, items: [] },
    upcomingRenewals: [],
    recommendations: briefing.collections.slice(0, 3).map((item) => ({
      type: "collections",
      priority: item.daysOverdue > 30 ? "high" : "medium",
      description: `${item.recommendedAction} for ${item.clientName} invoice #${item.invoiceNumber}`,
    })),
    generatedAt: new Date(briefing.generatedAt),
    metadata: {
      aiProvider: "gemini",
      modelUsed: aiModels[0] ?? "",
    },
  };
}
