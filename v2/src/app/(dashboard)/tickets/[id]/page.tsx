import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { TicketThread } from "@/components/tickets/TicketThread";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await api.tickets.get({ id }).catch(() => null);
  if (!ticket) notFound();

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Ticket #{ticket.number}</p>
        <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
      </div>
      <TicketThread ticket={ticket} />
    </div>
  );
}
