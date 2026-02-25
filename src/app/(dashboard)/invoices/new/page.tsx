import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";

export default async function NewInvoicePage() {
  const [clients, currencies, taxes] = await Promise.all([
    api.clients.list({ includeArchived: false }),
    api.currencies.list(),
    api.taxes.list(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/invoices"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Invoices
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">New Invoice</h1>
      </div>
      <InvoiceForm
        mode="create"
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol, symbolPosition: c.symbolPosition }))}
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate), isCompound: t.isCompound }))}
      />
    </div>
  );
}
