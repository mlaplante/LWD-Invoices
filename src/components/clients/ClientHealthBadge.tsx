"use client";

import { trpc } from "@/trpc/client";

const BAND_STYLES: Record<string, string> = {
  healthy: "bg-success/10 text-success-foreground",
  stable: "bg-accent text-accent-foreground",
  at_risk: "bg-warning/12 text-warning-foreground",
  critical: "bg-danger/10 text-danger-foreground",
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
