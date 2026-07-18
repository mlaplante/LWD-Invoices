"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { MessageSquare } from "lucide-react";
import { SUGGESTED_ACTIONS } from "@/lib/reply-triage-actions";

const triageStyles: Record<string, string> = { DISPUTE: "bg-red-100 text-red-800", PROMISE_TO_PAY: "bg-emerald-100 text-emerald-800", QUESTION: "bg-blue-100 text-blue-800", INFO_UPDATE: "bg-amber-100 text-amber-800", NEEDS_REVIEW: "bg-muted text-muted-foreground" };

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60_000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

export function InboundRepliesPanel({ invoiceId }: { invoiceId: string }) {
  const { data } = trpc.invoices.inboundReplies.useQuery({ invoiceId });

  // Render nothing until there's at least one reply — keeps the invoice page
  // uncluttered for the common no-reply case.
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Client replies</p>
        <span className="text-xs text-muted-foreground">({data.length})</span>
      </div>
      <ul className="divide-y divide-border/50">
        {data.map((reply) => (
          <li key={reply.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{reply.fromEmail}</span>
              <span className="text-xs text-muted-foreground shrink-0">{timeAgo(reply.receivedAt)}</span>
            </div>
            {reply.subject && (
              <p className="text-xs text-muted-foreground mt-0.5">{reply.subject}</p>
            )}
            {reply.bodyText && (
              <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-4">{reply.bodyText}</p>
            )}
            {reply.triage && <details className="mt-2 text-xs"><summary className="cursor-pointer list-none"><span className={`rounded px-2 py-1 font-medium ${triageStyles[reply.triage.category]}`}>{reply.triage.category.replaceAll("_", " ")}</span>{reply.triage.source !== "manual" && <span className="ml-2 text-muted-foreground">{Math.round(reply.triage.confidence * 100)}%</span>}</summary><p className="mt-2 text-muted-foreground">{reply.triage.reasoning}</p><p className="mt-1 font-medium">{SUGGESTED_ACTIONS[reply.triage.category]}</p></details>}
            {reply.ticketId && (
              <Link
                href={`/tickets/${reply.ticketId}`}
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                View in ticket →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
