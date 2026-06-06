import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { AGING_BUCKETS } from "@/server/services/ar-reports";

const BUCKET_STYLES: Record<string, { color: string; dotColor: string }> = {
  current: { color: "text-emerald-600", dotColor: "bg-emerald-500" },
  d1_30: { color: "text-amber-600", dotColor: "bg-amber-500" },
  d31_60: { color: "text-orange-600", dotColor: "bg-orange-500" },
  d61_90: { color: "text-red-500", dotColor: "bg-red-500" },
  d90plus: { color: "text-red-700", dotColor: "bg-red-700" },
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function DsoDashboardPage() {
  const [aging, trend, org] = await Promise.all([
    api.reports.arAging(),
    api.reports.dsoTrend(),
    api.organization.get(),
  ]);

  const current = trend[trend.length - 1];
  const prev = trend.length > 1 ? trend[trend.length - 2] : undefined;
  const currentDso = current?.dso ?? 0;
  const dsoDelta = prev ? currentDso - prev.dso : 0;
  const improving = dsoDelta < 0; // lower DSO = collecting faster

  const openCount = AGING_BUCKETS.reduce((s, b) => s + aging.buckets[b.key].count, 0);

  // ── DSO trend chart geometry ──────────────────────────────────────────────
  const CHART_H = 96;
  const PT_GAP = 46;
  const PAD_X = 8;
  const maxDso = Math.max(...trend.map((p) => p.dso), 1);
  const totalW = Math.max((trend.length - 1) * PT_GAP + PAD_X * 2, 1);
  const xFor = (i: number) => PAD_X + i * PT_GAP;
  const yFor = (dso: number) => CHART_H - (dso / maxDso) * CHART_H;
  const linePath = trend
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(p.dso)}`)
    .join(" ");
  const areaPath = trend.length
    ? `${linePath} L${xFor(trend.length - 1)},${CHART_H} L${xFor(0)},${CHART_H} Z`
    : "";

  return (
    <div className="space-y-5">
      <ReportHeader title="AR Aging & DSO" orgName={org.name} logoUrl={org.logoUrl} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">AR Aging &amp; DSO</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Days Sales Outstanding</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-bold tabular-nums">{currentDso.toFixed(1)}</p>
            <span className="text-sm text-muted-foreground">days</span>
            {prev && Math.abs(dsoDelta) >= 0.05 && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${improving ? "text-emerald-600" : "text-red-600"}`}>
                {improving ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                {Math.abs(dsoDelta).toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Avg. time to collect · {improving ? "improving" : prev ? "rising" : "current"} vs. last month
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Receivable</p>
          <p className="text-3xl font-bold tabular-nums mt-1">${fmtMoney(aging.totalAR)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Outstanding balance, net of payments</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Open Invoices</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{openCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">With a balance due</p>
        </div>
      </div>

      {/* DSO trend chart */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">DSO Trend</p>
          <p className="text-base font-semibold mt-0.5">Last {trend.length} Months</p>
        </div>
        <div className="px-6 py-5">
          {trend.every((p) => p.dso === 0) ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              Not enough billing history to compute DSO yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg
                width={totalW}
                height={CHART_H + 24}
                viewBox={`0 0 ${totalW} ${CHART_H + 24}`}
                style={{ display: "block", minWidth: "100%" }}
                preserveAspectRatio="none"
              >
                <path d={areaPath} fill="hsl(var(--primary) / 0.10)" />
                <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
                {trend.map((p, i) => (
                  <g key={p.month}>
                    <circle cx={xFor(i)} cy={yFor(p.dso)} r={i === trend.length - 1 ? 4 : 2.5} fill="hsl(var(--primary))" />
                    <text x={xFor(i)} y={CHART_H + 16} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                      {p.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Aging bucket summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {AGING_BUCKETS.map((b) => {
          const bucket = aging.buckets[b.key];
          const style = BUCKET_STYLES[b.key];
          const pct = aging.totalAR > 0 ? (bucket.total / aging.totalAR) * 100 : 0;
          return (
            <div key={b.key} className="rounded-2xl border border-border/50 bg-card px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{b.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${style.color}`}>${fmtMoney(bucket.total)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bucket.count} invoice{bucket.count !== 1 ? "s" : ""} · {pct.toFixed(0)}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Per-bucket tables — only render non-empty buckets */}
      {AGING_BUCKETS.map((b) => {
        const bucket = aging.buckets[b.key];
        if (bucket.rows.length === 0) return null;
        const style = BUCKET_STYLES[b.key];
        return (
          <div key={b.key} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${style.dotColor}`} />
              <p className="text-sm font-semibold">{b.label}</p>
              <span className="text-xs text-muted-foreground ml-auto tabular-nums">${fmtMoney(bucket.total)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/50">
                  <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="px-5 py-2 text-left">Invoice</th>
                    <th className="px-5 py-2 text-left">Client</th>
                    <th className="px-5 py-2 text-right">Due Date</th>
                    <th className="px-5 py-2 text-right">Days Overdue</th>
                    <th className="px-5 py-2 text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.rows.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="px-5 py-3">
                        <Link href={`/invoices/${inv.invoiceId}`} className="font-medium hover:text-primary transition-colors">
                          #{inv.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{inv.clientName}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {inv.dueDate
                          ? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${style.color}`}>
                        {inv.daysPastDue > 0 ? `${inv.daysPastDue}d` : "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">
                        {inv.currencySymbol}{fmtMoney(inv.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
