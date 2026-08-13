import { api } from "@/trpc/server";
import Link from "next/link";
import { FileText, CreditCard, Receipt, ChevronRight, TrendingUp, Clock, Timer, Download, Scale, PieChart, BarChart3, Gauge, Contact, HeartPulse, LineChart, Repeat, AlertTriangle, BellRing, Wallet, Activity, Percent, Users, Landmark } from "lucide-react";
import { ReportsAskPanel } from "@/components/reports/ReportsAskPanel";

const reports = [
  {
    href: "/reports/project-health",
    label: "Project Health",
    description: "Composite health per project from budget, tasks, unbilled time, and invoices.",
    icon: <Activity className="w-4 h-4" />,
    color: "bg-danger/10 text-danger-foreground",
  },
  {
    href: "/reports/tax-dashboard",
    label: "Tax-Ready Dashboard",
    description: "Sales tax due, income by service, deductible expenses, and 1099 exposure in one view.",
    icon: <Landmark className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/estimated-tax",
    label: "Estimated Taxes",
    description: "Quarterly self-employment set-aside from net income, with federal due dates.",
    icon: <Landmark className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/client-health",
    label: "Client Health",
    description: "Composite health score, churn risk, and upsell signals per client.",
    icon: <HeartPulse className="w-4 h-4" />,
    color: "bg-danger/10 text-danger-foreground",
  },
  {
    href: "/reports/client-concentration",
    label: "Client Concentration",
    description: "Revenue share per client with over-dependence risk indicators.",
    icon: <Users className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/cash-flow-forecast",
    label: "Cash-Flow Forecast",
    description: "Projected 30/60/90-day cash position with what-if late-payment scenarios.",
    icon: <LineChart className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
  },
  {
    href: "/reports/recurring-revenue",
    label: "Recurring Revenue",
    description: "MRR, ARR, ARPA, and revenue/logo churn across recurring streams.",
    icon: <Repeat className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/collections",
    label: "Smart Collections",
    description: "Open invoices ranked by late-payment risk with recommended dunning actions.",
    icon: <BellRing className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/expense-anomalies",
    label: "Expense Anomalies",
    description: "Duplicate-receipt detection and out-of-pattern spend, from your OCR data.",
    icon: <AlertTriangle className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/unpaid",
    label: "Unpaid Invoices",
    description: "Outstanding invoices requiring payment.",
    icon: <FileText className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/payments",
    label: "Payments by Gateway",
    description: "Revenue breakdown by payment method.",
    icon: <CreditCard className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
  },
  {
    href: "/reports/expenses",
    label: "Expense Breakdown",
    description: "Project expenses by category and supplier.",
    icon: <Receipt className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/profit-loss",
    label: "Profit & Loss",
    description: "Net income breakdown with revenue vs. expenses by month.",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/profitability",
    label: "Profitability",
    description: "Margin analysis by client and project.",
    icon: <PieChart className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/forecast",
    label: "Revenue Forecast",
    description: "Pipeline view of expected revenue over the next months.",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
  },
  {
    href: "/reports/aging",
    label: "Invoice Aging",
    description: "Outstanding invoices bucketed by days overdue.",
    icon: <Clock className="w-4 h-4" />,
    color: "bg-danger/10 text-danger-foreground",
  },
  {
    href: "/reports/dso",
    label: "AR Aging & DSO",
    description: "Receivables by balance due with a Days-Sales-Outstanding trend.",
    icon: <Gauge className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/retainers",
    label: "Retainer Burn-down",
    description: "Hours and prepaid retainers with projected depletion dates and 80% warnings.",
    icon: <Wallet className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/time",
    label: "Time Tracking",
    description: "Hours logged and billable totals by project.",
    icon: <Timer className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/utilization",
    label: "Utilization",
    description: "Billable vs non-billable time by client, project, or user.",
    icon: <Percent className="w-4 h-4" />,
    color: "bg-accent text-accent-foreground",
  },
  {
    href: "/reports/tax-liability",
    label: "Tax Liability",
    description: "Tax collected by type for your accountant.",
    icon: <Scale className="w-4 h-4" />,
    color: "bg-warning/12 text-warning-foreground",
  },
  {
    href: "/reports/year-end",
    label: "Year-End Export",
    description: "P&L, expenses, payments, and tax reports for your accountant.",
    icon: <Download className="w-4 h-4" />,
    color: "bg-danger/10 text-danger-foreground",
  },
  {
    href: "/reports/1099",
    label: "1099 / Contractor Tax Pack",
    description: "1099-NEC forms and a filing summary for contractors paid $600+.",
    icon: <Contact className="w-4 h-4" />,
    color: "bg-success/10 text-success-foreground",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px]">Reports</h1>
        <a
          href="/api/reports/invoices/export"
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-primary bg-card px-4 py-2 text-[11px] font-semibold uppercase tracking-[2px] text-primary transition-colors duration-200 ease-[ease] hover:bg-primary hover:text-primary-foreground"
        >
          <Download className="size-3.5" />
          Year-end export pack
        </a>
      </div>

      <ReportsAskPanel />

      {/* Revenue chart card */}
      <div className="rounded-[10px] border border-border bg-card overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow lowercase text-[11px]">
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
                        stroke="var(--border)"
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
                            fill={isCurrentMonth ? "var(--primary)" : "color-mix(in srgb, var(--primary) 35%, transparent)"}
                          />
                          <text
                            x={x + BAR_W / 2}
                            y={CHART_H + 18}
                            textAnchor="middle"
                            fontSize={9}
                            fill="var(--muted-foreground)"
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

      {/* Report launcher — one clipped card divided into cells rather than
          a field of separate cards, so the grid reads as a single index. */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group flex items-start gap-3 border-b border-r border-divider px-[22px] py-[18px] transition-colors duration-200 ease-[ease] last:border-b-0 hover:bg-primary/[0.03]"
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${r.color}`}
              >
                {r.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground transition-colors group-hover:text-primary">
                  {r.label}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {r.description}
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
