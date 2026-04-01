import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [invoice, clients, currencies, taxes, org] = await Promise.all([
    api.invoices.get({ id }).catch(() => null),
    api.clients.list({ includeArchived: false }),
    api.currencies.list(),
    api.taxes.list(),
    api.organization.get(),
  ]);

  if (!invoice) notFound();

  // The update mutation only allows DRAFT and SENT — redirect others to detail
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") notFound();

  const initialData = {
    id: invoice.id,
    type: invoice.type,
    date: new Date(invoice.date).toISOString().slice(0, 10),
    dueDate: invoice.dueDate
      ? new Date(invoice.dueDate).toISOString().slice(0, 10)
      : "",
    currencyId: invoice.currencyId,
    number: invoice.number,
    notes: invoice.notes ?? "",
    clientId: invoice.clientId,
    reminderDaysOverride: invoice.reminderDaysOverride,
    discountType: (invoice.discountType as "percentage" | "fixed" | null) ?? null,
    discountAmount: Number(invoice.discountAmount),
    discountDescription: invoice.discountDescription ?? "",
    lines: invoice.lines.map((line) => ({
      sort: line.sort,
      lineType: line.lineType,
      name: line.name,
      description: line.description ?? undefined,
      qty: Number(line.qty),
      rate: Number(line.rate),
      period: line.period != null ? Number(line.period) : undefined,
      discount: Number(line.discount),
      discountIsPercentage: line.discountIsPercentage,
      taxIds: line.taxes.map((lt) => lt.tax.id),
      sourceTable: line.sourceTable ?? undefined,
      sourceId: line.sourceId ?? undefined,
    })),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={`/invoices/${invoice.id}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          #{invoice.number}
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Edit Invoice</h1>
      </div>

      <InvoiceForm
        mode="edit"
        initialData={initialData}
        orgPaymentTermsDays={org.defaultPaymentTermsDays}
        clients={clients.map((c) => ({ id: c.id, name: c.name, defaultPaymentTermsDays: c.defaultPaymentTermsDays }))}
        currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol, symbolPosition: c.symbolPosition }))}
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate), isCompound: t.isCompound }))}
      />
    </div>
  );
}
