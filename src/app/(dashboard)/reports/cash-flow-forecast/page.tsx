"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { ChevronLeft } from "lucide-react";

function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface ScenarioState {
  clientId: string;
  clientName: string;
  delayDays: number;
}

export default function CashFlowForecastPage() {
  const [scenario, setScenario] = useState<ScenarioState | null>(null);

  const { data, isLoading, error } = trpc.analytics.cashFlowForecast.useQuery(
    scenario ? { scenarios: [scenario] } : undefined,
  );

  // Distinct clients with open-invoice inflows, for the scenario picker.
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of data?.base.inflows ?? []) {
      if (e.source === "open_invoice" && e.clientId) {
        map.set(e.clientId, e.label.replace(" — open invoice", ""));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Cash-Flow Forecast</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Projected cash position over the next 30/60/90 days from open receivables (weighted by
          aging), recurring invoices, autopay, and recurring expenses.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Projecting…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.base.horizons.map((h) => {
              const scen = data.scenario?.horizons.find((s) => s.horizonDays === h.horizonDays);
              return (
                <div key={h.horizonDays} className="rounded-2xl border border-border/50 bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {h.horizonDays} days
                  </p>
                  <p className="font-display text-2xl mt-1 tabular-nums">{usd(h.projectedPosition)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    +{usd(h.projectedInflow)} in · −{usd(h.projectedOutflow)} out
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Net {usd(h.netChange)} · {Math.round(h.confidence * 100)}% confidence
                  </p>
                  {scen && (
                    <p className="text-xs mt-2 pt-2 border-t border-border/50 text-amber-700">
                      Scenario: {usd(scen.projectedPosition)} ({usd(scen.projectedPosition - h.projectedPosition)})
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scenario planner */}
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <p className="text-sm font-semibold mb-1">What-if: a client pays late</p>
            <p className="text-xs text-muted-foreground mb-3">
              See how a delayed payment shifts your projected position.
            </p>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open receivables to model.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="border border-border/50 rounded-lg px-3 py-1.5 text-sm bg-background"
                  value={scenario?.clientId ?? ""}
                  onChange={(e) => {
                    const c = clients.find((x) => x.id === e.target.value);
                    setScenario(c ? { clientId: c.id, clientName: c.name, delayDays: scenario?.delayDays ?? 30 } : null);
                  }}
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">pays</span>
                <select
                  className="border border-border/50 rounded-lg px-3 py-1.5 text-sm bg-background disabled:opacity-50"
                  disabled={!scenario}
                  value={scenario?.delayDays ?? 30}
                  onChange={(e) =>
                    setScenario((s) => (s ? { ...s, delayDays: Number(e.target.value) } : s))
                  }
                >
                  {[15, 30, 45, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} days late
                    </option>
                  ))}
                </select>
                {scenario && (
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                    onClick={() => setScenario(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {data.base.assumptions.join(" ")}
          </p>
        </>
      )}
    </div>
  );
}
