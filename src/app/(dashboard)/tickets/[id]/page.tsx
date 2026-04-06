import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketThread } from "@/components/tickets/TicketThread";
import { cn } from "@/lib/utils";

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  LOW:    { label: "Low",    className: "bg-gray-100 text-gray-500" },
  NORMAL: { label: "Normal", className: "bg-blue-50 text-blue-600" },
  HIGH:   { label: "High",   className: "bg-amber-50 text-amber-600" },
  URGENT: { label: "Urgent", className: "bg-red-50 text-red-600" },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN:        { label: "Open",        className: "bg-emerald-50 text-emerald-600" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-50 text-blue-600" },
  CLOSED:      { label: "Closed",      className: "bg-gray-100 text-gray-500" },
  RESOLVED:    { label: "Resolved",    className: "bg-primary/10 text-primary" },
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await api.tickets.get({ id }).catch(() => null);
  if (!ticket) notFound();

  const priority = PRIORITY_BADGE[ticket.priority] ?? { label: ticket.priority, className: "bg-gray-100 text-gray-500" };
  const status = STATUS_BADGE[ticket.status] ?? { label: ticket.status, className: "bg-gray-100 text-gray-500" };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/tickets"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tickets
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight truncate">
          #{ticket.number} — {ticket.subject}
        </h1>
        <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0", status.className)}>
          {status.label}
        </span>
        <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0", priority.className)}>
          {priority.label}
        </span>
      </div>

      {/* Ticket meta */}
      {ticket.client && (
        <div className="rounded-2xl border border-border/50 bg-card px-6 py-4 flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Client</p>
            <p className="font-medium mt-0.5">{ticket.client.name}</p>
          </div>
        </div>
      )}

      {/* Thread */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Thread
          </p>
          <p className="text-base font-semibold mt-0.5">Conversation</p>
        </div>
        <div className="p-6">
          <TicketThread ticket={ticket} />
        </div>
      </div>
    </div>
  );
}
