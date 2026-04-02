import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

export default async function TicketsPage() {
  const tickets = await api.tickets.list({});

  const open = tickets.filter((t) => t.status === "OPEN").length;
  const urgent = tickets.filter((t) => t.priority === "URGENT").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
        <Button asChild size="sm">
          <Link href="/tickets/new">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Ticket
          </Link>
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{tickets.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Open</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{open}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Urgent</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-red-600">{urgent}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Tickets
          </p>
          <p className="text-base font-semibold mt-0.5">All Tickets</p>
        </div>

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
            <Link
              href="/tickets/new"
              className="mt-2 text-sm text-primary hover:underline"
            >
              Create your first ticket
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2 p-3">
              {tickets.map((t) => {
                const priority = PRIORITY_BADGE[t.priority] ?? { label: t.priority, className: "bg-gray-100 text-gray-500" };
                const status = STATUS_BADGE[t.status] ?? { label: t.status, className: "bg-gray-100 text-gray-500" };
                return (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="block rounded-xl border border-border/50 bg-card p-4 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">
                        #{t.number} — {t.subject}
                      </p>
                      <span className={cn("shrink-0 inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold", status.className)}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t.client?.name ?? "No client"}
                      </p>
                      <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold", priority.className)}>
                        {priority.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                    </p>
                  </Link>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {tickets.map((t) => {
                    const priority = PRIORITY_BADGE[t.priority] ?? { label: t.priority, className: "bg-gray-100 text-gray-500" };
                    const status = STATUS_BADGE[t.status] ?? { label: t.status, className: "bg-gray-100 text-gray-500" };
                    return (
                      <tr key={t.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                          #{t.number}
                        </td>
                        <td className="px-6 py-3.5">
                          <Link
                            href={`/tickets/${t.id}`}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {t.subject}
                          </Link>
                        </td>
                        <td className="px-6 py-3.5 text-muted-foreground">
                          {t.client?.name ?? "—"}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold", status.className)}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold", priority.className)}>
                            {priority.label}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-muted-foreground text-xs">
                          {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
