import { AlertCircle, TrendingUp, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BriefingData = {
  weekLabel: string;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  overdueInvoices: {
    count: number;
    totalAmount: number;
  };
  expenseAnomalies: {
    count: number;
    details: string[];
  };
  upcomingRenewals: {
    count: number;
    clients: string[];
  };
  recommendedActions: string[];
};

type Props = {
  data: BriefingData | null;
  error: Error | null;
};

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function BriefingCard({ icon: Icon, title, value, subtitle, color }: { icon: React.ComponentType<{ className?: string }>; title: string; value?: string; subtitle?: string; color: string }) {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card p-4")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          {value && <p className="font-display text-xl font-bold mt-1">{value}</p>}
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyBriefing() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center justify-center min-h-[200px]">
      <div className="text-center space-y-2">
        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          No briefing data available for this period
        </p>
        <p className="text-xs text-muted-foreground">
          Briefings are generated when sufficient financial data is available for the selected week
        </p>
      </div>
    </div>
  );
}

function ErrorBriefing({ error }: { error: Error }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Briefing load failed</p>
          <p className="text-xs text-red-700 mt-1">{error.message}</p>
        </div>
      </div>
    </div>
  );
}

export function WeeklyBriefing({ data, error }: Props) {
  if (error) {
    return <ErrorBriefing error={error} />;
  }
  if (!data) {
    return <EmptyBriefing />;
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Weekly Business Briefing
            </p>
            <p className="text-sm font-semibold mt-0.5">{data.weekLabel}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Generated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BriefingCard
          icon={TrendingUp}
          title="Cash In"
          value={fmt(data.cashIn)}
          color="text-emerald-600 bg-emerald-50"
        />
        <BriefingCard
          icon={AlertTriangle}
          title="Cash Out"
          value={fmt(data.cashOut)}
          color="text-red-600 bg-red-50"
        />
        <BriefingCard
          icon={CheckCircle2}
          title="Net Cash Flow"
          value={fmt(data.netCashFlow)}
          color={data.netCashFlow >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}
        />
        <BriefingCard
          icon={AlertCircle}
          title="Overdue Invoices"
          value={`${data.overdueInvoices.count}`}
          subtitle={fmt(data.overdueInvoices.totalAmount)}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      {/* Expense Anomalies */}
      <div className="px-6 pb-4">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Expense Anomalies
            </p>
            {data.expenseAnomalies.count > 0 && (
              <span className="ml-auto text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">
                {data.expenseAnomalies.count} detected
              </span>
            )}
          </div>
          {data.expenseAnomalies.details.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.expenseAnomalies.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No anomalies detected — all expenses within expected ranges</p>
          )}
        </div>
      </div>

      {/* Upcoming Renewals */}
      <div className="px-6 pb-4">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Upcoming Client Renewals
            </p>
            {data.upcomingRenewals.count > 0 && (
              <span className="ml-auto text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-md">
                {data.upcomingRenewals.count} clients
              </span>
            )}
          </div>
          {data.upcomingRenewals.clients.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.upcomingRenewals.clients.map((client, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                  <span>{client}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No client renewals scheduled this week</p>
          )}
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="px-6 pb-6">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Recommended Actions
            </p>
          </div>
          {data.recommendedActions.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.recommendedActions.map((action, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No specific actions recommended at this time</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyBriefingWidget({ data, error }: Props) {
  if (error) {
    return <ErrorBriefing error={error} />;
  }
  if (!data) {
    return <EmptyBriefing />;
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Weekly Business Briefing
            </p>
            <p className="text-sm font-semibold mt-0.5">{data.weekLabel}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Generated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BriefingCard
          icon={TrendingUp}
          title="Cash In"
          value={fmt(data.cashIn)}
          color="text-emerald-600 bg-emerald-50"
        />
        <BriefingCard
          icon={AlertTriangle}
          title="Cash Out"
          value={fmt(data.cashOut)}
          color="text-red-600 bg-red-50"
        />
        <BriefingCard
          icon={CheckCircle2}
          title="Net Cash Flow"
          value={fmt(data.netCashFlow)}
          color={data.netCashFlow >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}
        />
        <BriefingCard
          icon={AlertCircle}
          title="Overdue Invoices"
          value={`${data.overdueInvoices.count}`}
          subtitle={fmt(data.overdueInvoices.totalAmount)}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      {/* Expense Anomalies */}
      <div className="px-6 pb-4">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Expense Anomalies
            </p>
            {data.expenseAnomalies.count > 0 && (
              <span className="ml-auto text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">
                {data.expenseAnomalies.count} detected
              </span>
            )}
          </div>
          {data.expenseAnomalies.details.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.expenseAnomalies.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No anomalies detected — all expenses within expected ranges</p>
          )}
        </div>
      </div>

      {/* Upcoming Renewals */}
      <div className="px-6 pb-4">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Upcoming Client Renewals
            </p>
            {data.upcomingRenewals.count > 0 && (
              <span className="ml-auto text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-md">
                {data.upcomingRenewals.count} clients
              </span>
            )}
          </div>
          {data.upcomingRenewals.clients.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.upcomingRenewals.clients.map((client, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                  <span>{client}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No client renewals scheduled this week</p>
          )}
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="px-6 pb-6">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Recommended Actions
            </p>
          </div>
          {data.recommendedActions.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.recommendedActions.map((action, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No specific actions recommended at this time</p>
          )}
        </div>
      </div>
    </div>
  );
}
