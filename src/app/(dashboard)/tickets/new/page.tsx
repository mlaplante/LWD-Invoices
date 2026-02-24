import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketForm } from "@/components/tickets/TicketForm";

export default function NewTicketPage() {
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
        <h1 className="text-xl font-bold tracking-tight">New Ticket</h1>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <TicketForm />
      </div>
    </div>
  );
}
