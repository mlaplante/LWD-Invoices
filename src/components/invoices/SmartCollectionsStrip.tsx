import Link from "next/link";
import { Sparkles } from "lucide-react";

import { api } from "@/trpc/server";

const ACTION_COPY: Record<string, string> = {
  pre_due_nudge: "a gentle pre-due nudge",
  reminder: "a reminder",
  firm_reminder: "a firm-tone reminder",
  escalate: "an escalation",
  final_notice: "a final notice",
  monitor: "no action yet",
};

/**
 * Sits under the invoice table rather than behind a "Collections" nav item —
 * the risk ranking is most useful where you're already looking at the list.
 *
 * Renders nothing when there's nothing to chase, so a clean AR ledger stays
 * visually clean.
 */
export async function SmartCollectionsStrip() {
  let queue: Awaited<ReturnType<typeof api.collections.queue>>["queue"] = [];
  try {
    ({ queue } = await api.collections.queue({ limit: 50 }));
  } catch {
    // Collections is role-gated; viewers just don't see the strip.
    return null;
  }

  const actionable = queue.filter((item) => item.actionDue);
  if (actionable.length === 0) return null;

  const highRisk = actionable.filter((item) => item.band === "high");
  const top = actionable[0];

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border bg-muted px-4 py-3">
      <span className="flex shrink-0 items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" />
        <span className="eyebrow text-[10px]">smart collections</span>
      </span>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {highRisk.length > 0
          ? `${highRisk.length} invoice${highRisk.length === 1 ? "" : "s"} ranked high-risk. `
          : `${actionable.length} invoice${actionable.length === 1 ? "" : "s"} ready for follow-up. `}
        Recommended: {ACTION_COPY[top.recommendedAction] ?? "a reminder"} to{" "}
        {top.clientName} on {top.invoiceNumber}.
      </p>
      <Link
        href="/collections"
        className="inline-flex shrink-0 items-center rounded-[6px] border border-primary px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary transition-colors duration-200 ease-[ease] hover:bg-primary hover:text-primary-foreground"
      >
        Open queue →
      </Link>
    </div>
  );
}
