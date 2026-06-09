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

const COMPONENT_LABELS: Record<string, string> = {
  budgetBurn: "Budget Burn",
  overdueTasks: "Overdue Tasks",
  unbilledTime: "Unbilled Time",
  unpaidInvoices: "Unpaid Invoices",
  responseRate: "Client Response",
};

/**
 * Compact project-health chip for the project detail header. Renders nothing
 * until the score loads (or if the project has no activity to score yet).
 */
export function ProjectHealthBadge({ projectId }: { projectId: string }) {
  const { data } = trpc.projects.healthScore.useQuery({ projectId });
  const score = data?.score;
  if (!score) return null;

  const title =
    score.signals.length > 0
      ? score.signals.join(" • ")
      : `Health score ${score.score}`;

  const components = score.components as Record<
    string,
    { score: number; weight: number; detail: string }
  >;

  return (
    <span
      title={title}
      className={`group relative inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0 cursor-default ${BAND_STYLES[score.band]}`}
    >
      Health {score.score}
      <span className="opacity-70">· {BAND_LABELS[score.band]}</span>

      {/* Hover popover */}
      <span className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 hidden group-hover:flex flex-col w-64 rounded-xl border border-border/50 bg-popover p-3 shadow-lg text-foreground text-left">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Component Scores
        </span>
        {Object.entries(components).map(([key, comp]) => (
          <span key={key} className="flex flex-col py-1 border-b border-border/30 last:border-0">
            <span className="flex items-center justify-between">
              <span className="text-xs font-medium">{COMPONENT_LABELS[key] ?? key}</span>
              <span className="text-xs tabular-nums font-semibold">{comp.score}</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">{comp.detail}</span>
          </span>
        ))}
        {score.signals.length > 0 && (
          <span className="flex flex-col mt-2 pt-2 border-t border-border/30">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Signals
            </span>
            {score.signals.map((sig, i) => (
              <span key={i} className="text-[11px] text-muted-foreground">• {sig}</span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
