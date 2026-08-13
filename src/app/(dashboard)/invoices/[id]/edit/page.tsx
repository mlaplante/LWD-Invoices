import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getInvoiceTemplateConfig } from "@/server/services/invoice-template-config";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [invoice, { items: clients }, currencies, taxes, org] = await Promise.all([
    api.invoices.get({ id }).catch(() => null),
    api.clients.list({ includeArchived: false, pageSize: 100 }),
    api.currencies.list(),
    api.taxes.list(),
    api.organization.get(),
  ]);

  if (!invoice) notFound();

  // The update mutation only allows DRAFT and SENT — redirect others to detail
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") notFound();

  const templateConfig = getInvoiceTemplateConfig(org);

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
      <div className="flex min-w-0 items-center gap-3.5">
        <Link
          href="/invoices"
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Invoices
        </Link>
        <h1 className="min-w-0 truncate font-display text-2xl">
          {invoice.number}
          <span className="ml-2.5 font-mono text-xs tracking-normal text-muted-foreground">
            {invoice.status === "DRAFT" ? "draft" : "sent"}
          </span>
        </h1>
      </div>

      <InvoiceForm
        mode="edit"
        initialData={initialData}
        orgPaymentTermsDays={org.defaultPaymentTermsDays}
        orgDefaultDepositPercent={org.defaultDepositPercent}
        clients={clients.map((c) => ({ id: c.id, name: c.name, defaultPaymentTermsDays: c.defaultPaymentTermsDays }))}
        currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol, symbolPosition: c.symbolPosition }))}
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate), isCompound: t.isCompound }))}
        invoiceStatus={invoice.status === "SENT" ? "SENT" : "DRAFT"}
        templateConfig={templateConfig}
        orgDisplay={{ name: org.name, logoUrl: org.logoUrl }}
      />
    </div>
  );
}
