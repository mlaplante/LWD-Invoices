import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const RISK_COPY: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical concentration", cls: "bg-red-50 text-red-700 border-red-200" },
  high: { label: "High concentration", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  watch: { label: "Worth watching", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ok: { label: "Well diversified", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default async function ClientConcentrationReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const [data, org] = await Promise.all([
    api.reports.clientConcentration({ from, to }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const risk = RISK_COPY[data.summary.riskLevel];

  return (
    <div className="space-y-5">
      <ReportHeader title="Client Concentration" orgName={org.name} logoUrl={org.logoUrl} dateRange={dateRange} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/reports" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden">
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Client Concentration</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/client-concentration" from={params.from} to={params.to} />

      {data.summary.totalRevenue === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No payments recorded for the selected period.</p>
        </div>
      ) : (
        <>
          {data.summary.topClientName && (
            <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${risk.cls}`}>
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">{risk.label}</p>
                <p className="text-sm mt-0.5">
                  Top client <span className="font-semibold">{data.summary.topClientName}</span> is{" "}
                  {data.summary.topClientPct.toFixed(1)}% of revenue.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Top Client</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.topClientPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Top 3 Clients</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.top3Pct.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">HHI</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{Math.round(data.summary.hhi)}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">Active Clients</p>
              <p className="text-2xl font-bold mt-0.5 tabular-nums">{data.summary.activeClients}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detail</p>
              <p className="text-base font-semibold mt-0.5">Revenue Share by Client</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Share</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cumulative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.rows.map((r) => (
                    <tr key={r.clientId} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{r.name}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums">${r.revenue.toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(r.share, 100)}%` }} />
                          </div>
                          <span className="tabular-nums w-12 text-right">{r.share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">{r.cumulativeShare.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
