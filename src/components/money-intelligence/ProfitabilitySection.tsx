"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingDown, ArrowRight } from "lucide-react";

/**
 * Cash-margin profitability insights for the Money Intelligence hub.
 *
 * Surfaces clients losing money or sitting below the median margin, on a
 * cash-margin basis (own time free). Links to the existing
 * /reports/profitability table for the full breakdown; that report uses a
 * different cost basis and is intentionally left as-is.
 */
export function ProfitabilitySection() {
  const { data, isLoading } = trpc.analytics.profitabilityInsights.useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profitability insights</CardTitle>
        <CardDescription>
          Cash-margin highlights across clients (revenue minus expenses and contractor pay; your own
          time counted as free). For the full table, see{" "}
          <Link href="/reports/profitability" className="underline underline-offset-2">
            Reports → Profitability
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Analyzing…</p>
        ) : data && data.insights.recommendations.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Median client margin:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {data.insights.medianMarginPercent}%
              </span>
            </p>
            <ul className="space-y-2">
              {data.insights.recommendations.slice(0, 6).map((rec) => (
                <li
                  key={`${rec.type}-${rec.id}`}
                  className="flex items-start gap-2 rounded-lg border border-border/50 p-3 text-sm"
                >
                  {rec.type === "negative_margin" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : (
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span>{rec.message}</span>
                </li>
              ))}
            </ul>
            {data.unattributedContractorCost > 0 && (
              <p className="text-xs text-muted-foreground">
                Note: ${data.unattributedContractorCost.toLocaleString("en-US")} of contractor pay
                isn&apos;t linked to a project, so it isn&apos;t attributed to any client above.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No margin concerns to flag yet — every client is at or above your median.
          </p>
        )}
        <Link
          href="/reports/profitability"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          View full profitability report <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
