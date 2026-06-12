import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { buildWeeklyBriefing } from "@/server/services/weekly-briefing";

export async function GET() {
  const { data: { user } } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = user.app_metadata?.organizationId as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 });
  }

  const data = await buildWeeklyBriefing(db, orgId);
  const horizon30 = data.forecast.find((h) => h.horizonDays === 30);

  return NextResponse.json({
    weekLabel: `${new Date(Date.now() - 7 * 86400000).toLocaleDateString()} - ${new Date().toLocaleDateString()}`,
    cashIn: horizon30?.projectedInflow ?? 0,
    cashOut: 0,
    netCashFlow: horizon30?.projectedPosition ?? 0,
    overdueInvoices: {
      count: data.overdue.count,
      totalAmount: data.overdue.total,
    },
    expenseAnomalies: {
      count: 0,
      details: [],
    },
    upcomingRenewals: {
      count: data.atRiskClients.length,
      clients: data.atRiskClients.map((client) => client.clientName),
    },
    recommendedActions: data.collections.map(
      (item) => `${item.recommendedAction}: #${item.invoiceNumber} · ${item.clientName}`,
    ),
  });
}
