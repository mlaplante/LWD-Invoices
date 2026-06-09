import type { PrismaClient } from "@/generated/prisma";

export type ClientRevenue = { clientId: string; name: string; revenue: number };

export type ConcentrationRow = ClientRevenue & {
  share: number; // percent 0..100
  cumulativeShare: number; // percent 0..100, running total
};

export type RiskLevel = "ok" | "watch" | "high" | "critical";

export type ConcentrationSummary = {
  totalRevenue: number;
  activeClients: number;
  topClientPct: number;
  top3Pct: number;
  top5Pct: number;
  hhi: number; // 0..10000 Herfindahl-Hirschman Index
  riskLevel: RiskLevel;
  topClientName: string | null;
};

export type ConcentrationResult = {
  rows: ConcentrationRow[];
  summary: ConcentrationSummary;
};

function riskFromTopShare(topPct: number): RiskLevel {
  if (topPct >= 50) return "critical";
  if (topPct >= 30) return "high";
  if (topPct >= 15) return "watch";
  return "ok";
}

export function computeConcentration(clients: ClientRevenue[]): ConcentrationResult {
  const positive = clients.filter((c) => c.revenue > 0);
  const totalRevenue = positive.reduce((s, c) => s + c.revenue, 0);

  if (totalRevenue <= 0) {
    return {
      rows: [],
      summary: {
        totalRevenue: 0,
        activeClients: 0,
        topClientPct: 0,
        top3Pct: 0,
        top5Pct: 0,
        hhi: 0,
        riskLevel: "ok",
        topClientName: null,
      },
    };
  }

  const sorted = [...positive].sort((a, b) => b.revenue - a.revenue);

  let cumulative = 0;
  const rows: ConcentrationRow[] = sorted.map((c) => {
    const share = (c.revenue / totalRevenue) * 100;
    cumulative += share;
    return { ...c, share, cumulativeShare: cumulative };
  });

  const sumShares = (n: number) =>
    rows.slice(0, n).reduce((s, r) => s + r.share, 0);

  const hhi = sorted.reduce(
    (s, c) => s + (c.revenue / totalRevenue) ** 2,
    0,
  ) * 10000;

  const topClientPct = rows[0]?.share ?? 0;

  return {
    rows,
    summary: {
      totalRevenue,
      activeClients: rows.length,
      topClientPct,
      top3Pct: sumShares(3),
      top5Pct: sumShares(5),
      hhi,
      riskLevel: riskFromTopShare(topClientPct),
      topClientName: rows[0]?.name ?? null,
    },
  };
}

type DateRange = { from?: Date; to?: Date };

/**
 * Cash-basis client concentration over a date range: each client's share is the
 * payments collected from their invoices divided by total payments collected.
 */
export async function getClientConcentration(
  db: PrismaClient,
  orgId: string,
  range: DateRange,
): Promise<ConcentrationResult> {
  const dateFilter =
    range.from || range.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  const payments = await db.payment.findMany({
    where: {
      organizationId: orgId,
      ...(dateFilter ? { paidAt: dateFilter } : {}),
    },
    select: {
      amount: true,
      invoice: {
        select: { clientId: true, client: { select: { name: true } } },
      },
    },
  });

  const byClient = new Map<string, ClientRevenue>();
  for (const p of payments) {
    const clientId = p.invoice.clientId;
    const existing = byClient.get(clientId);
    if (existing) {
      existing.revenue += Number(p.amount);
    } else {
      byClient.set(clientId, {
        clientId,
        name: p.invoice.client.name,
        revenue: Number(p.amount),
      });
    }
  }

  return computeConcentration(Array.from(byClient.values()));
}
