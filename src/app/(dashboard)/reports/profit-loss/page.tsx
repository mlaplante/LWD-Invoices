import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortMonth(key: string) {
  return MONTH_NAMES[parseInt(key.split("-")[1], 10) - 1] ?? "";
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw   = params.to   ? new Date(params.to)   : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to   = toRaw   && !isNaN(toRaw.getTime())   ? toRaw   : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const [data, org] = await Promise.all([
    api.reports.profitLoss({ from, to }),
    api.organization.get(),
  ]);

  const dateRange = from || to
    ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
    : "All Time";

  const months = Array.from(
    new Set([...Object.keys(data.revenueByMonth), ...Object.keys(data.expensesByMonth)])
  ).sort().slice(-12);

  const maxVal = Math.max(...months.flatMap((m) => [data.revenueByMonth[m] ?? 0, data.expensesByMonth[m] ?? 0]), 1);
  const CHART_H = 100;
  const BAR_W = 14;
  const BAR_GAP = 2;
  const GROUP_GAP = 6;
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const totalW = months.length * GROUP_W - GROUP_GAP;

  return (
    <div className="space-y-5">
      <ReportHeader title="Profit & Loss" orgName={org.name} logoUrl={org.logoUrl} dateRange={dateRange} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Profit & Loss</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/profit-loss" from={params.from} to={params.to} />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Revenue", value: data.totalRevenue, color: "text-emerald-600" },
          { label: "Total Expenses", value: data.totalExpenses, color: "text-red-600" },
          { label: "Net Income", value: data.netIncome, color: data.netIncome >= 0 ? "text-primary" : "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>${s.value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5">
        <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
        <div className="overflow-x-auto">
          <svg width={totalW} height={CHART_H + 28} viewBox={`0 0 ${totalW} ${CHART_H + 28}`} style={{ display: "block" }}>
            {months.map((m, i) => {
              const rev = data.revenueByMonth[m] ?? 0;
              const exp = data.expensesByMonth[m] ?? 0;
              const x = i * GROUP_W;
              const revH = Math.max((rev / maxVal) * CHART_H, rev > 0 ? 2 : 0);
              const expH = Math.max((exp / maxVal) * CHART_H, exp > 0 ? 2 : 0);
              return (
                <g key={m}>
                  <rect x={x} y={CHART_H - revH} width={BAR_W} height={revH} rx={2} fill="hsl(var(--primary) / 0.7)" />
                  <rect x={x + BAR_W + BAR_GAP} y={CHART_H - expH} width={BAR_W} height={expH} rx={2} fill="hsl(0 72% 51% / 0.5)" />
                  <text x={x + BAR_W} y={CHART_H + 18} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{shortMonth(m)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/70 inline-block" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/50 inline-block" />Expenses</span>
        </div>
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border/50">
            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 text-left">Month</th>
              <th className="px-5 py-3 text-right">Revenue</th>
              <th className="px-5 py-3 text-right">Expenses</th>
              <th className="px-5 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const rev = data.revenueByMonth[m] ?? 0;
              const exp = data.expensesByMonth[m] ?? 0;
              const net = rev - exp;
              return (
                <tr key={m} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{shortMonth(m)} {m.split("-")[0]}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">${rev.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-red-600">${exp.toFixed(2)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${net >= 0 ? "text-primary" : "text-red-600"}`}>${net.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
