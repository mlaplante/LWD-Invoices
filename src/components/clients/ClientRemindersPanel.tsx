"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { BellRing, Sparkles, Repeat } from "lucide-react";

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60_000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

/**
 * Reminder history aggregated across all of a client's invoices — manual
 * one-click sends and automated sequence sends, newest first, each linked to
 * its invoice. Renders nothing until at least one reminder exists.
 */
export function ClientRemindersPanel({ clientId }: { clientId: string }) {
  const { data } = trpc.clients.reminderHistory.useQuery({ clientId });

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
        <BellRing className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Reminders sent</p>
        <span className="text-xs text-muted-foreground">({data.length})</span>
      </div>
      <ul className="divide-y divide-border/50">
        {data.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="px-5 py-3 flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {r.kind === "manual" ? <Sparkles className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.subject}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Link href={`/invoices/${r.invoiceId}`} className="hover:text-primary hover:underline">
                  #{r.invoiceNumber}
                </Link>
                {" · "}
                {r.kind === "manual" ? (
                  <>
                    Manual
                    {r.source === "ai" ? " · AI-drafted" : r.source === "template_fallback" ? " · template" : ""}
                    {r.tone ? ` · ${r.tone}` : ""}
                  </>
                ) : (
                  <>Sequence{r.sequenceName ? ` · ${r.sequenceName}` : ""}</>
                )}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.sentAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
