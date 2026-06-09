"use client";

import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";

function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Runway / burn section of the Money Intelligence hub. Shows monthly burn and
 * the projected net cash position over 30/60/90 days. Honest framing — no
 * fabricated "days of cash" unless a starting balance is known.
 */
export function RunwaySection() {
  const { data, isLoading } = trpc.analytics.runway.useQuery();

  const burning = (data?.monthlyBurn ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runway &amp; burn</CardTitle>
        <CardDescription>
          Monthly burn and projected net cash position over the next 30/60/90 days, from your
          recurring revenue, recurring expenses, and contractor outflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculating…</p>
        ) : data ? (
          <>
            {/* Burn headline */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Monthly burn
                </p>
                <p
                  className={`flex items-center gap-1.5 text-2xl font-bold tabular-nums ${
                    burning ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {burning ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                  {usd(Math.abs(data.monthlyBurn))}/mo
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.note}</p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Recurring revenue: <span className="tabular-nums text-foreground">{usd(data.monthlyRecurringRevenue)}/mo</span></p>
                <p>Recurring expense: <span className="tabular-nums text-foreground">{usd(data.monthlyRecurringExpense)}/mo</span></p>
                {data.daysOfCash != null && (
                  <p>Est. days of cash: <span className="tabular-nums text-foreground">{data.daysOfCash}</span></p>
                )}
              </div>
            </div>

            {/* Net positions */}
            <div className="grid gap-3 sm:grid-cols-3">
              {data.netPositions.map((p) => (
                <div key={p.horizonDays} className="rounded-lg border border-border/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {p.horizonDays} days
                  </p>
                  <p className="text-xl font-bold tabular-nums mt-1">{usd(p.projectedPosition)}</p>
                  <p className={`text-xs ${p.netChange < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    Net {p.netChange < 0 ? "" : "+"}{usd(p.netChange)}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No forecast data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
