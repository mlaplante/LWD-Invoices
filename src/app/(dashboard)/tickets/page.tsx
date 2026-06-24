import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TicketsList } from "@/components/tickets/TicketsList";

export default async function TicketsPage() {
  // Summary counts come from the DB (correct regardless of how many list pages
  // are loaded); the first page of rows is rendered server-side and handed to
  // the client list, which loads further pages on demand.
  const [summary, firstPage] = await Promise.all([
    api.tickets.summary(),
    api.tickets.list({ limit: 50 }),
  ]);

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
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Open</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{summary.open}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Urgent</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-red-600">{summary.urgent}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Tickets
          </p>
          <p className="text-base font-semibold mt-0.5">All Tickets</p>
        </div>

        <TicketsList initialItems={firstPage.items} initialCursor={firstPage.nextCursor} />
      </div>
    </div>
  );
}
