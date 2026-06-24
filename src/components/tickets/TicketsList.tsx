"use client";

import { trpc } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TicketsListOutput = inferRouterOutputs<AppRouter>["tickets"]["list"];
type TicketItem = TicketsListOutput["items"][number];

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

const PAGE_SIZE = 50;

/**
 * Client-side, cursor-paginated ticket list. Seeded with the first page the
 * server component already rendered (so first paint is unchanged), then loads
 * further pages on demand instead of fetching every ticket up front.
 */
export function TicketsList({
  initialItems,
  initialCursor,
}: {
  initialItems: TicketItem[];
  initialCursor?: string;
}) {
  const query = trpc.tickets.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialData: {
        pages: [{ items: initialItems, nextCursor: initialCursor }],
        pageParams: [undefined],
      },
    },
  );

  const tickets = query.data?.pages.flatMap((p) => p.items) ?? initialItems;

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No tickets yet.</p>
        <Link href="/tickets/new" className="mt-2 text-sm text-primary hover:underline">
          Create your first ticket
        </Link>
      </div>
    );
  }

  return (
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
                    <Link href={`/tickets/${t.id}`} className="font-medium hover:text-primary transition-colors">
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

      {query.hasNextPage && (
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
