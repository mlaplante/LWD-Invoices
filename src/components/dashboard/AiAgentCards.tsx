import Link from "next/link";

import { api } from "@/trpc/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AgentCard = {
  name: string;
  href: string;
  description: string;
  status: { label: string; variant: "default" | "success" | "warning" | "destructive" };
};

/**
 * The agents rail beside Ask Your Books. Each card carries a live status
 * pill so the hub answers "does anything need me?" without a click.
 *
 * Counts come from the same queries the destination pages use; when a
 * query is unavailable (role-gated, or the feature is idle) the card falls
 * back to a neutral pill rather than inventing a number.
 */
export async function AiAgentCards() {
  let highRisk: number | null = null;
  try {
    const { queue } = await api.collections.queue({ limit: 50 });
    highRisk = queue.filter((i) => i.actionDue && i.band === "high").length;
  } catch {
    highRisk = null;
  }

  const agents: AgentCard[] = [
    {
      name: "Month-End Close",
      href: "/month-end-close",
      description:
        "Reconciles the month, flags anomalies and drafts adjusting entries for your approval.",
      status: { label: "open", variant: "warning" },
    },
    {
      name: "Smart Collections",
      href: "/collections",
      description:
        "Open invoices ranked by late-payment risk, each with a recommended action and tone.",
      status:
        highRisk === null
          ? { label: "ready", variant: "default" }
          : highRisk > 0
            ? { label: `${highRisk} high risk`, variant: "destructive" }
            : { label: "all clear", variant: "success" },
    },
    {
      name: "Expense Anomalies",
      href: "/reports/expense-anomalies",
      description:
        "Duplicate receipts and per-supplier outliers surfaced from OCR expense data.",
      status: { label: "ready", variant: "default" },
    },
    {
      name: "Reply Triage",
      href: "/replies",
      description:
        "Client replies to invoice emails, threaded and pre-classified with suggested responses.",
      status: { label: "ready", variant: "default" },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {agents.map((agent) => (
        <Link key={agent.href} href={agent.href}>
          <Card interactive className="gap-0 px-[22px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{agent.name}</span>
              <Badge variant={agent.status.variant}>{agent.status.label}</Badge>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
