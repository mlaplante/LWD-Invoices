"use client";

import { trpc } from "@/trpc/client";

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

/**
 * Compact client-health chip for the client detail header. Renders nothing
 * until the score loads (or if the client has no invoices to score yet).
 */
export function ClientHealthBadge({ clientId }: { clientId: string }) {
  const { data } = trpc.analytics.clientHealthForClient.useQuery({ clientId });
  const score = data?.score;
  if (!score) return null;

  const title = score.signals.length > 0 ? score.signals.join(" • ") : `Churn risk ${score.churnRiskPercent}%`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0 ${BAND_STYLES[score.band]}`}
    >
      Health {score.score}
      <span className="opacity-70">· {BAND_LABELS[score.band]}</span>
    </span>
  );
}
