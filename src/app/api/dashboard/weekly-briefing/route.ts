import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { buildWeeklyBriefing } from "@/server/services/weekly-briefing";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";

export async function GET() {
  // Resolve the org through live UserOrganization membership (+ activeOrgId
  // cookie), not the stale app_metadata.organizationId — the latter let a user
  // removed from an org keep reading its financial briefing.
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = auth;

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
