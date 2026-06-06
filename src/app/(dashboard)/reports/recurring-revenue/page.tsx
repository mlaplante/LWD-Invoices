"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { ChevronLeft } from "lucide-react";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="font-display text-2xl sm:text-3xl mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function RecurringRevenuePage() {
  const { data, isLoading, error } = trpc.analytics.subscriptionMetrics.useQuery();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Recurring Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          MRR, ARR, and churn across recurring invoices and hours-retainers, treated as a
          subscription book. Window: last {data?.periodDays ?? 30} days.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="MRR" value={usd(data.mrr)} sub={`${data.activeStreams} active streams`} />
            <Metric label="ARR" value={usd(data.arr)} />
            <Metric label="ARPA" value={usd(data.arpa)} sub={`${data.activeCustomers} customers`} />
            <Metric
              label="Net new MRR"
              value={`${data.netNewMrr >= 0 ? "+" : ""}${usd(data.netNewMrr)}`}
              sub={`+${usd(data.newMrr)} new · −${usd(data.churnedMrr)} churned`}
            />
            <Metric
              label="Revenue churn"
              value={`${data.revenueChurnRatePercent}%`}
              sub={`of ${usd(data.mrrAtPeriodStart)} at period start`}
            />
            <Metric
              label="Logo churn"
              value={`${data.logoChurnRatePercent}%`}
              sub={`${data.churnedCustomers} of ${data.customersAtPeriodStart} customers`}
            />
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              MRR by source
            </p>
            <div className="space-y-2 text-sm">
              {[
                { label: "Recurring invoices", value: data.mrrByKind.recurring_invoice },
                { label: "Flat retainers", value: data.mrrByKind.retainer },
                { label: "Hours retainers", value: data.mrrByKind.hours_retainer },
              ].map((row) => {
                const pct = data.mrr > 0 ? (row.value / data.mrr) * 100 : 0;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-muted-foreground">{row.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-accent overflow-hidden">
                      <div className="h-full bg-primary/60" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-20 text-right tabular-nums">{usd(row.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
