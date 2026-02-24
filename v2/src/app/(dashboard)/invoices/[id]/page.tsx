import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RecordPaymentButton } from "@/components/invoices/RecordPaymentButton";
import { InvoiceComments } from "@/components/invoices/InvoiceComments";
import { RecurringInvoiceDialog } from "@/components/invoices/RecurringInvoiceDialog";
import type { InvoiceStatus } from "@/generated/prisma";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

function fmt(
  n: number | { toNumber(): number },
  symbol: string,
  pos: string
): string {
  const val = typeof n === "object" ? n.toNumber() : n;
  return pos === "before"
    ? `${symbol}${val.toFixed(2)}`
    : `${val.toFixed(2)}${symbol}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PAYABLE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let invoice;
  try {
    invoice = await api.invoices.get({ id });
  } catch {
    notFound();
  }

  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const f = (n: Parameters<typeof fmt>[0]) => fmt(n, sym, symPos);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalLink = `${appUrl}/portal/${invoice.portalToken}`;
  const isPayable = PAYABLE_STATUSES.includes(invoice.status);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Invoices
          </Link>
          <h1 className="text-2xl font-bold">#{invoice.number}</h1>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[invoice.status]}`}
          >
            {invoice.status.replace("_", " ")}
          </span>
        </div>

        {/* Contextual actions */}
        <div className="flex gap-2">
          {invoice.status === "DRAFT" && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/invoices/${invoice.id}/edit`}>Edit</Link>
              </Button>
              <form action={`/api/invoices/${invoice.id}/send`} method="POST">
                <Button size="sm" type="submit">
                  Send
                </Button>
              </form>
            </>
          )}
          {invoice.status === "SENT" && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/invoices/${invoice.id}/edit`}>Edit</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              </Button>
            </>
          )}
          {(invoice.status === "PAID" ||
            invoice.status === "PARTIALLY_PAID") && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Download PDF
              </a>
            </Button>
          )}
          {invoice.status !== "SENT" &&
            invoice.status !== "PAID" &&
            invoice.status !== "PARTIALLY_PAID" && (
              <Button asChild variant="ghost" size="sm">
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF
                </a>
              </Button>
            )}

          {/* Recurring */}
          <RecurringInvoiceDialog invoiceId={invoice.id} />

          {/* Portal link */}
          <CopyPortalLinkButton portalLink={portalLink} />

          {/* Record payment */}
          {isPayable && (
            <RecordPaymentButton
              invoiceId={invoice.id}
              invoiceTotal={Number(invoice.total)}
            />
          )}
        </div>
      </div>

      {/* Invoice card */}
      <div className="rounded-lg border bg-card p-6">
        {/* Header */}
        <div className="flex justify-between border-b pb-6 mb-6">
          <div>
            <p className="text-xl font-bold">{invoice.organization.name}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">
              {invoice.type === "ESTIMATE" ? "ESTIMATE" : "INVOICE"}
            </p>
            <p className="text-muted-foreground">#{invoice.number}</p>
          </div>
        </div>

        {/* Client + dates */}
        <div className="flex justify-between mb-8">
          <div>
            <p className="text-xs uppercase text-muted-foreground mb-1">Bill To</p>
            <p className="font-semibold">{invoice.client.name}</p>
            {invoice.client.email && (
              <p className="text-sm text-muted-foreground">{invoice.client.email}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground mb-1">Date</p>
            <p className="text-sm mb-3">{formatDate(invoice.date)}</p>
            {invoice.dueDate && (
              <>
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  Due Date
                </p>
                <p className="text-sm">{formatDate(invoice.dueDate)}</p>
              </>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead className="border-b">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Rate</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="py-2">
                  <p className="font-medium">{line.name}</p>
                  {line.description && (
                    <p className="text-xs text-muted-foreground">{line.description}</p>
                  )}
                </td>
                <td className="py-2 text-right">{Number(line.qty).toFixed(2)}</td>
                <td className="py-2 text-right">{f(line.rate)}</td>
                <td className="py-2 text-right font-medium">{f(line.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{f(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>-{f(invoice.discountTotal)}</span>
              </div>
            )}
            {Number(invoice.taxTotal) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>{f(invoice.taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 text-base font-bold">
              <span>Total</span>
              <span>{f(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-6 rounded bg-muted/30 p-4">
            <p className="text-xs uppercase text-muted-foreground mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Payments */}
      {invoice.payments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Payment History</h2>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Method</th>
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{formatDate(p.paidAt)}</td>
                    <td className="px-4 py-2 capitalize">{p.method}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                      {p.transactionId ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {f(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partial payment schedule */}
      {invoice.partialPayments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Payment Schedule</h2>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">Due</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoice.partialPayments.map((pp, i) => (
                  <tr key={pp.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2">{formatDate(pp.dueDate)}</td>
                    <td className="px-4 py-2 text-right">
                      {pp.isPercentage
                        ? `${Number(pp.amount).toFixed(0)}%`
                        : f(pp.amount)}
                    </td>
                    <td className="px-4 py-2">
                      {pp.isPaid ? (
                        <span className="text-xs font-medium text-green-600">
                          Paid {formatDate(pp.paidAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comments */}
      <InvoiceComments invoiceId={invoice.id} />
    </div>
  );
}

// Small client component just for the copy button
function CopyPortalLinkButton({ portalLink }: { portalLink: string }) {
  // This is a server component file, so this must be a separate client component.
  // For simplicity, render as a regular anchor that opens the portal.
  return (
    <Button asChild variant="outline" size="sm">
      <a href={portalLink} target="_blank" rel="noreferrer">
        Portal Link ↗
      </a>
    </Button>
  );
}
