"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { ChevronLeft } from "lucide-react";

const BAND_STYLES: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  stable: "bg-blue-50 text-blue-700",
  at_risk: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

const BAND_LABELS: Record<string, string> = {
  healthy: "Healthy",
  stable: "Stable",
  at_risk: "At risk",
  critical: "Critical",
};

export default function ClientHealthPage() {
  const { data, isLoading, error } = trpc.analytics.clientHealth.useQuery();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Client Health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Composite score from payment behavior, email engagement, revenue trend, and overdue
          pressure. Most at-risk clients first.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Scoring clients…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && data.scores.length === 0 && (
        <p className="text-sm text-muted-foreground">No clients to score yet.</p>
      )}

      {data && data.scores.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2 text-left">Client</th>
                  <th className="px-5 py-2 text-left">Health</th>
                  <th className="px-5 py-2 text-right">Score</th>
                  <th className="px-5 py-2 text-right">Churn risk</th>
                  <th className="px-5 py-2 text-left">Signals</th>
                </tr>
              </thead>
              <tbody>
                {data.scores.map((s) => (
                  <tr key={s.clientId} className="border-b border-border/50 last:border-0 align-top">
                    <td className="px-5 py-3 font-medium">
                      {s.clientName}
                      {s.lowData && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          low data
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md ${BAND_STYLES[s.band]}`}
                      >
                        {BAND_LABELS[s.band]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{s.score}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.churnRiskPercent}%</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-md">
                      {s.signals.length > 0 ? (
                        <ul className="space-y-0.5">
                          {s.signals.map((sig, i) => (
                            <li key={i}>• {sig}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
