"use client";

import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";

function usd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function accuracyTone(accuracy: number): string {
  if (accuracy >= 85) return "text-emerald-600";
  if (accuracy >= 65) return "text-amber-600";
  return "text-red-600";
}

/**
 * Forecast accuracy section of the Money Intelligence hub: grades past
 * cash-flow forecasts against the payments that actually arrived, making the
 * forecast above it self-validating. Populated by the weekly snapshot cron —
 * the first scores appear once a 30-day window has closed.
 */
export function ForecastAccuracySection() {
  const { data, isLoading } = trpc.analytics.forecastAccuracy.useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Forecast accuracy
        </CardTitle>
        <CardDescription>
          Every week the cash-flow forecast is snapshotted; once each window closes, it&apos;s
          graded against the payments that actually arrived.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.summary.sampleCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No graded forecasts yet
            {data && data.pendingCount > 0
              ? ` — ${data.pendingCount} snapshot${data.pendingCount === 1 ? "" : "s"} waiting for their window to close. The first grades appear once a 30-day horizon matures.`
              : ". Snapshots are captured automatically every Monday."}
          </p>
        ) : (
          <>
            {data.biasNote && (
              <p className="text-sm font-medium text-foreground">{data.biasNote}</p>
            )}

            {/* Per-horizon accuracy */}
            <div className="grid gap-3 sm:grid-cols-3">
              {data.summary.horizons.map((h) => (
                <div key={h.horizonDays} className="rounded-lg border border-border/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {h.horizonDays}-day forecasts
                  </p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${accuracyTone(h.meanAccuracy)}`}>
                    {h.meanAccuracy.toFixed(0)}% accurate
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.biasDirection === "on-target"
                      ? "on target"
                      : `${h.biasDirection} by ${Math.abs(h.meanBiasPct).toFixed(0)}%`}{" "}
                    · {h.sampleCount} sample{h.sampleCount === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>

            {/* Recent scored snapshots */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">Captured</th>
                    <th className="pb-2">Horizon</th>
                    <th className="pb-2 text-right">Forecast</th>
                    <th className="pb-2 text-right">Actual</th>
                    <th className="pb-2 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.recent.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 text-muted-foreground">
                        {new Date(row.capturedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-muted-foreground">{row.horizonDays}d</td>
                      <td className="py-2 text-right tabular-nums">{usd(row.projectedInflow)}</td>
                      <td className="py-2 text-right tabular-nums">{usd(row.actualInflow)}</td>
                      <td className={`py-2 text-right tabular-nums font-medium ${accuracyTone(row.accuracy)}`}>
                        {row.accuracy.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
