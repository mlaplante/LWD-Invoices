import { Users, ShieldCheck } from "lucide-react";
import type { BenchmarkResult, MetricBenchmark } from "@/server/services/benchmarking";

/**
 * Presentational card for the anonymized cross-tenant benchmark. Server
 * component — it only renders the aggregate result returned by
 * analytics.benchmarks (no client state, no raw peer data).
 */
export function BenchmarkCard({ benchmark }: { benchmark: BenchmarkResult }) {
  if (!benchmark.available) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card px-5 py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="w-4 h-4" />
          <p className="text-xs font-bold uppercase tracking-widest">Peer Benchmark</p>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {benchmark.reason === "insufficient_cohort"
            ? "Not enough similar businesses yet to benchmark privately. We only compare once a cohort is large enough to stay anonymous."
            : "Benchmarks appear once you have billing history in the last 12 months."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="w-4 h-4" />
          <p className="text-xs font-bold uppercase tracking-widest">
            Peer Benchmark · {benchmark.bandLabel}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5" />
          anonymized · {benchmark.cohortSize} businesses
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        {benchmark.dso && <MetricRow label="Days Sales Outstanding" unit="days" metric={benchmark.dso} />}
        {benchmark.percentOverdue && <MetricRow label="AR Past Due" unit="%" metric={benchmark.percentOverdue} />}
      </div>
    </div>
  );
}

function MetricRow({ label, unit, metric }: { label: string; unit: string; metric: MetricBenchmark }) {
  // percentile = share of peers beaten; high is always good (the metric's own
  // direction is already baked in by `lowerIsBetter` upstream).
  const strong = metric.percentile >= 50;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm mt-1">
        <span className={`font-bold ${strong ? "text-emerald-600" : "text-amber-600"}`}>
          Beats {metric.percentile}%
        </span>{" "}
        of similar businesses
      </p>
      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
        You: {metric.value}
        {unit === "%" ? "%" : ` ${unit}`} · Cohort median: {metric.cohortMedian}
        {unit === "%" ? "%" : ` ${unit}`}
      </p>
    </div>
  );
}
