import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortMonth(key: string) {
  return MONTH_NAMES[parseInt(key.split("-")[1], 10) - 1] ?? "";
}

const HORIZON_OPTIONS = [3, 6, 12] as const;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const months = HORIZON_OPTIONS.includes(Number(params.months) as 3 | 6 | 12)
    ? (Number(params.months) as 3 | 6 | 12)
    : 6;

  const [data, org] = await Promise.all([
    api.reports.revenueForecast({ months }),
    api.organization.get(),
  ]);

  const max = Math.max(...data.months.map((m) => m.total), 1);
  const CHART_H = 100;
  const BAR_W = 14;
  const BAR_GAP = 2;
  const GROUP_GAP = 6;
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const totalW = data.months.length * GROUP_W - GROUP_GAP;

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Revenue Forecast"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`Next ${months} months`}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Forecast</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Horizon selector */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit print:hidden">
        {HORIZON_OPTIONS.map((h) => (
          <Link
            key={h}
            href={`/reports/forecast?months=${h}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              months === h
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {h} months
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Pipeline", value: data.summary.totalOutstanding, color: "text-blue-600" },
          { label: `Recurring (${months}mo)`, value: data.summary.totalRecurring, color: "text-emerald-600" },
          { label: "Combined Forecast", value: data.summary.grandTotal, color: "text-primary" },
          { label: "Overdue", value: data.summary.overdueAmount, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/50 bg-card px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>
              ${s.value.toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Stacked bar chart */}
      <div className="rounded-2xl border border-border/50 bg-card px-6 py-5">
        <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
        {data.summary.grandTotal === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No forecasted revenue.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg
                width={totalW}
                height={CHART_H + 28}
                viewBox={`0 0 ${totalW} ${CHART_H + 28}`}
                style={{ display: "block" }}
              >
                {data.months.map((m, i) => {
                  const x = i * GROUP_W;
                  const outH = Math.max((m.outstanding / max) * CHART_H, m.outstanding > 0 ? 2 : 0);
                  const recH = Math.max((m.recurring / max) * CHART_H, m.recurring > 0 ? 2 : 0);
                  return (
                    <g key={m.month}>
                      <rect
                        x={x}
                        y={CHART_H - outH}
                        width={BAR_W}
                        height={outH}
                        rx={2}
                        fill="hsl(var(--primary) / 0.7)"
                      />
                      <rect
                        x={x + BAR_W + BAR_GAP}
                        y={CHART_H - recH}
                        width={BAR_W}
                        height={recH}
                        rx={2}
                        fill="hsl(142 71% 45% / 0.6)"
                      />
                      <text
                        x={x + BAR_W}
                        y={CHART_H + 18}
                        textAnchor="middle"
                        fontSize={9}
                        fill="hsl(var(--muted-foreground))"
                      >
                        {shortMonth(m.month)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/70 inline-block" />
                Outstanding
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: "hsl(142 71% 45% / 0.6)" }} />
                Recurring
              </span>
            </div>
          </>
        )}
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/50">
            <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 text-left">Month</th>
              <th className="px-5 py-3 text-right">Outstanding</th>
              <th className="px-5 py-3 text-right">Recurring</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-3 font-medium">
                  {shortMonth(m.month)} {m.month.split("-")[0]}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-blue-600">
                  ${m.outstanding.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-emerald-600">
                  ${m.recurring.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-primary">
                  ${m.total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
