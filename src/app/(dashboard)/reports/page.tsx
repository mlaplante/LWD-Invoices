import { api } from "@/trpc/server";
import Link from "next/link";
import { FileText, CreditCard, Receipt, ChevronRight, TrendingUp, Clock, Timer, Download, Scale, PieChart, BarChart3 } from "lucide-react";

const reports = [
  {
    href: "/reports/unpaid",
    label: "Unpaid Invoices",
    description: "Outstanding invoices requiring payment.",
    icon: <FileText className="w-4 h-4" />,
    color: "bg-amber-50 text-amber-600",
  },
  {
    href: "/reports/payments",
    label: "Payments by Gateway",
    description: "Revenue breakdown by payment method.",
    icon: <CreditCard className="w-4 h-4" />,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    href: "/reports/expenses",
    label: "Expense Breakdown",
    description: "Project expenses by category and supplier.",
    icon: <Receipt className="w-4 h-4" />,
    color: "bg-violet-50 text-violet-600",
  },
  {
    href: "/reports/profit-loss",
    label: "Profit & Loss",
    description: "Net income breakdown with revenue vs. expenses by month.",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "bg-blue-50 text-blue-600",
  },
  {
    href: "/reports/profitability",
    label: "Profitability",
    description: "Margin analysis by client and project.",
    icon: <PieChart className="w-4 h-4" />,
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    href: "/reports/forecast",
    label: "Revenue Forecast",
    description: "Pipeline view of expected revenue over the next months.",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "bg-teal-50 text-teal-600",
  },
  {
    href: "/reports/aging",
    label: "Invoice Aging",
    description: "Outstanding invoices bucketed by days overdue.",
    icon: <Clock className="w-4 h-4" />,
    color: "bg-red-50 text-red-600",
  },
  {
    href: "/reports/time",
    label: "Time Tracking",
    description: "Hours logged and billable totals by project.",
    icon: <Timer className="w-4 h-4" />,
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    href: "/reports/tax-liability",
    label: "Tax Liability",
    description: "Tax collected by type for your accountant.",
    icon: <Scale className="w-4 h-4" />,
    color: "bg-orange-50 text-orange-600",
  },
  {
    href: "/reports/year-end",
    label: "Year-End Export",
    description: "P&L, expenses, payments, and tax reports for your accountant.",
    icon: <Download className="w-4 h-4" />,
    color: "bg-rose-50 text-rose-600",
  },
];

// ── Revenue chart helpers ─────────────────────────────────────────────────────

function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    // Use UTC to match groupByMonth() in reports.ts which also uses UTC
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function shortMonth(key: string): string {
  const month = parseInt(key.split("-")[1], 10) - 1;
  return MONTH_NAMES[month] ?? "";
}

function formatAmount(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ReportsPage() {
  const revenueData = await api.reports.revenueByMonth({});

  const months = getLast12Months();
  const values = months.map((m) => revenueData[m] ?? 0);
  const max = Math.max(...values, 1);
  const totalRevenue = values.reduce((s, v) => s + v, 0);
  const avgRevenue = totalRevenue / 12;

  const CHART_H = 80;
  const BAR_W = 20;
  const BAR_GAP = 6;
  const totalW = months.length * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <a
          href="/api/reports/invoices/export"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export Invoices CSV
        </a>
      </div>

      {/* Revenue chart card */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border/50 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Revenue
            </p>
            <p className="text-base font-semibold mt-0.5">Last 12 Months</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold tabular-nums">${totalRevenue.toFixed(2)}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          {totalRevenue === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No revenue recorded yet.
            </div>
          ) : (
            <>
              {/* Max label */}
              <div className="flex items-end gap-0 mb-1">
                <span className="text-xs text-muted-foreground w-10 shrink-0 text-right pr-2 pb-0.5">
                  {formatAmount(max)}
                </span>
                {/* Chart */}
                <div className="flex-1 overflow-x-auto">
                  <svg
                    width={totalW}
                    height={CHART_H + 28}
                    style={{ display: "block", minWidth: "100%" }}
                    viewBox={`0 0 ${totalW} ${CHART_H + 28}`}
                    preserveAspectRatio="none"
                  >
                    {/* Avg line */}
                    {avgRevenue > 0 && (
                      <line
                        x1={0}
                        y1={CHART_H - (avgRevenue / max) * CHART_H}
                        x2={totalW}
                        y2={CHART_H - (avgRevenue / max) * CHART_H}
                        stroke="hsl(var(--border))"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}
                    {months.map((m, i) => {
                      const barH = Math.max((values[i] / max) * CHART_H, values[i] > 0 ? 2 : 0);
                      const x = i * (BAR_W + BAR_GAP);
                      const y = CHART_H - barH;
                      const isCurrentMonth = i === months.length - 1;
                      return (
                        <g key={m}>
                          <rect
                            x={x}
                            y={y}
                            width={BAR_W}
                            height={barH}
                            rx={3}
                            fill={isCurrentMonth ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.35)"}
                          />
                          <text
                            x={x + BAR_W / 2}
                            y={CHART_H + 18}
                            textAnchor="middle"
                            fontSize={9}
                            fill="hsl(var(--muted-foreground))"
                          >
                            {shortMonth(m)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-right">
                Monthly avg: <span className="font-medium">${avgRevenue.toFixed(2)}</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Nav cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group rounded-2xl border border-border/50 bg-card p-4 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-start gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.color}`}>
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                {r.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {r.description}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
