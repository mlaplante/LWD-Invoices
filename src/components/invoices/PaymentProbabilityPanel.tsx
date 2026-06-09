"use client";

import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";
import { Gauge } from "lucide-react";

type Props = { invoiceId: string };

const BAND_CONFIG: Record<string, { label: string; className: string; bar: string }> = {
  high: { label: "Likely to pay", className: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  medium: { label: "Uncertain", className: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  low: { label: "At risk", className: "bg-red-50 text-red-700", bar: "bg-red-500" },
};

/**
 * Per-invoice payment-probability breakdown for the invoice detail page. Reads
 * the org-wide payment-probability map and surfaces this invoice's score with
 * its contributing factors. Renders nothing for invoices that aren't open
 * (paid/draft invoices aren't scored).
 */
export function PaymentProbabilityPanel({ invoiceId }: Props) {
  const { data, isLoading } = trpc.analytics.paymentProbability.useQuery();
  if (isLoading) return null;
  const score = data?.byInvoiceId[invoiceId];
  if (!score) return null;

  const band = BAND_CONFIG[score.paymentProbabilityBand] ?? BAND_CONFIG.medium;

  return (
    <div className="rounded-lg border border-border/50 p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Payment probability</h2>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold tabular-nums">{score.paymentProbabilityPercent}%</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", band.className)}>
          {band.label}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", band.bar)}
          style={{ width: `${score.paymentProbabilityPercent}%` }}
        />
      </div>

      {score.reasons.length > 0 && (
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          {score.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
