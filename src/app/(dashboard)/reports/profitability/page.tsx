import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const TABS = ["client", "project"] as const;
type Tab = (typeof TABS)[number];

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "project" ? "project" : "client";
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const [clientData, projectData, org] = await Promise.all([
    tab === "client" ? api.reports.profitabilityByClient({ from, to }) : null,
    tab === "project" ? api.reports.profitabilityByProject({ from, to }) : null,
    api.organization.get(),
  ]);

  const data = tab === "client" ? clientData! : projectData!;

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Profitability"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={dateRange}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Profitability</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit print:hidden">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/reports/profitability?tab=${t}${params.from ? `&from=${params.from}` : ""}${params.to ? `&to=${params.to}` : ""}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            By {t === "client" ? "Client" : "Project"}
          </Link>
        ))}
      </div>

      <ReportFilters basePath="/reports/profitability" from={params.from} to={params.to}>
        <input type="hidden" name="tab" value={tab} />
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: data.totalRevenue, color: "text-emerald-600" },
          { label: "Total Costs", value: data.totalCosts, color: "text-red-600" },
          { label: "Total Margin", value: data.totalMargin, color: data.totalMargin >= 0 ? "text-primary" : "text-red-600" },
          { label: "Avg Margin %", value: null, pct: data.avgMarginPercent, color: data.avgMarginPercent >= 0 ? "text-primary" : "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>
              {s.pct !== undefined ? `${s.pct}%` : `$${s.value!.toFixed(2)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No data for the selected period.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 text-left">
                  {tab === "client" ? "Client" : "Project"}
                </th>
                {tab === "project" && (
                  <th className="px-5 py-3 text-left">Client</th>
                )}
                <th className="px-5 py-3 text-right">Revenue</th>
                <th className="px-5 py-3 text-right">Costs</th>
                <th className="px-5 py-3 text-right">Margin</th>
                <th className="px-5 py-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: Record<string, unknown>) => {
                const name = (tab === "client" ? row.clientName : row.projectName) as string;
                const margin = row.margin as number;
                return (
                  <tr
                    key={(row.clientId ?? row.projectId) as string}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium">{name}</td>
                    {tab === "project" && (
                      <td className="px-5 py-3 text-muted-foreground">
                        {row.clientName as string}
                      </td>
                    )}
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-600">
                      ${(row.revenue as number).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">
                      ${(row.costs as number).toFixed(2)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums font-semibold ${margin >= 0 ? "text-primary" : "text-red-600"}`}
                    >
                      ${margin.toFixed(2)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${(row.marginPercent as number) >= 0 ? "text-primary" : "text-red-600"}`}
                    >
                      {(row.marginPercent as number).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {tab === "project" && data.rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Note: Project revenue only includes amounts from billed time entries and expenses. Manually created invoice lines are attributed at the client level.
        </p>
      )}
    </div>
  );
}
