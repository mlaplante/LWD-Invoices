import { api } from "@/trpc/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const priorityColors = {
  LOW: "secondary",
  NORMAL: "outline",
  HIGH: "default",
  URGENT: "destructive",
} as const;

export default async function TicketsPage() {
  const tickets = await api.tickets.list({});

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
        <Button asChild>
          <Link href="/tickets/new">New Ticket</Link>
        </Button>
      </div>
      {tickets.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          No tickets yet. <Link href="/tickets/new" className="underline">Create your first ticket.</Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Subject</th>
                <th className="text-left p-3">Client</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-muted-foreground">#{t.number}</td>
                  <td className="p-3">
                    <Link href={`/tickets/${t.id}`} className="hover:underline font-medium">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{t.client?.name ?? "—"}</td>
                  <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                  <td className="p-3">
                    <Badge variant={priorityColors[t.priority]}>{t.priority}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
