import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CashFlowInsightMetrics, NarrativeResult } from "@/server/services/cash-flow-insights";

type Props = {
  data: {
    metrics: CashFlowInsightMetrics;
    narrative: NarrativeResult;
  };
};

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function changeLabel(value: number | null): string {
  if (value === null) return "No baseline";
  return `${value >= 0 ? "+" : ""}${value}%`;
}

const severityClass = {
  info: "border-primary/30 bg-accent text-accent-foreground",
  success: "border-success/30 bg-success/10 text-success-foreground",
  warning: "border-warning/30 bg-warning/12 text-warning-foreground",
  danger: "border-danger/30 bg-danger/10 text-danger-foreground",
};

export function CashFlowInsights({ data }: Props) {
  const { metrics, narrative } = data;
  const isQuarterUp = (metrics.currentQuarter.cashInChangePercent ?? 0) >= 0;
  const TrendIcon = isQuarterUp ? TrendingUp : TrendingDown;

  return (
    <section className="rounded-[10px] border border-border bg-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI cash-flow insights</p>
              <h2 className="text-base font-semibold">Narrative and action cards</h2>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {narrative.summary}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <TrendIcon className={cn("h-4 w-4", isQuarterUp ? "text-success-foreground" : "text-warning-foreground")} />
          <span className="font-semibold">{changeLabel(metrics.currentQuarter.cashInChangePercent)}</span>
          <span className="text-muted-foreground">vs last quarter</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {metrics.cards.map((card) => (
          <div key={card.title} className={cn("rounded-xl border p-4", severityClass[card.severity])}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{card.title}</h3>
              {card.metric ? <span className="shrink-0 text-sm font-bold">{card.metric}</span> : null}
            </div>
            <p className="mt-2 text-sm opacity-85">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">This month net</p>
          <p className="mt-1 font-semibold">{money(metrics.currentMonth.netCash)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">This quarter cash in</p>
          <p className="mt-1 font-semibold">{money(metrics.currentQuarter.cashIn)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Overdue balance</p>
          <p className="mt-1 font-semibold">{money(metrics.overdue.total)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Narrative source</p>
          <p className="mt-1 font-semibold capitalize">{narrative.source}</p>
        </div>
      </div>

      {metrics.unbilledRetainerOpportunities.length > 0 ? (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Unbilled retainer opportunities</p>
          <ul className="mt-2 space-y-1 text-sm">
            {metrics.unbilledRetainerOpportunities.slice(0, 3).map((item) => (
              <li key={`${item.clientId}:${item.retainerName}`} className="flex items-center justify-between gap-3">
                <span>{item.clientName} · {item.retainerName}</span>
                <span className="font-medium">{item.hours}h{item.estimatedValue !== null ? ` · est. ${money(item.estimatedValue)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Estimates use deterministic app data first. AI summarization receives aggregate metrics only, not raw invoice rows or client details.
      </p>
    </section>
  );
}
