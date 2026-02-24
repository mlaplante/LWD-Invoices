import { TicketForm } from "@/components/tickets/TicketForm";

export default function NewTicketPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Ticket</h1>
      <TicketForm />
    </div>
  );
}
