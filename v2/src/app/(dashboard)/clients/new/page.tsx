import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientForm } from "@/components/clients/ClientForm";

export default function NewClientPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/clients"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Clients
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Client</h1>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <ClientForm mode="create" />
      </div>
    </div>
  );
}
