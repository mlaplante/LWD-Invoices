import { api } from "@/trpc/server";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";

export default async function NewInvoicePage() {
  const [clients, currencies, taxes] = await Promise.all([
    api.clients.list({ includeArchived: false }),
    api.currencies.list(),
    api.taxes.list(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New Invoice</h1>
      <InvoiceForm
        mode="create"
        clients={clients}
        currencies={currencies}
        taxes={taxes}
      />
    </div>
  );
}
