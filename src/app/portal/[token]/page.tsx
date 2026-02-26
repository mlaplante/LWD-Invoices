import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { PaymentButtons } from "@/components/portal/PaymentButtons";
import { PortalComments } from "@/components/portal/PortalComments";
import { EstimateActions } from "@/components/portal/EstimateActions";
import { decryptJson } from "@/server/services/encryption";
import type { PayPalConfig } from "@/server/services/gateway-config";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",      dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",     dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",       dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",         dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",     dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",      dot: "bg-gray-300" },
};

function fmt(
  n: number | { toNumber(): number },
  symbol: string,
  pos: string
): string {
  const val = typeof n === "object" ? n.toNumber() : n;
  return pos === "before" ? `${symbol}${val.toFixed(2)}` : `${val.toFixed(2)}${symbol}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const PAYABLE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await db.invoice.findUnique({
    where: { portalToken: token },
    include: {
      client: true,
      currency: true,
      organization: true,
      lines: {
        include: { taxes: { include: { tax: true } } },
        orderBy: { sort: "asc" },
      },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });

  if (!invoice) notFound();

  const sym = invoice.currency.symbol;
  const symPos = invoice.currency.symbolPosition;
  const f = (n: Parameters<typeof fmt>[0]) => fmt(n, sym, symPos);

  // Load enabled gateways — include configJson so we can build the PayPal URL server-side
  const gatewayRows = await db.gatewaySetting.findMany({
    where: { organizationId: invoice.organizationId, isEnabled: true },
    select: { gatewayType: true, surcharge: true, label: true, configJson: true },
  });

  const gateways = gatewayRows.map((g) => {
    const base = {
      gatewayType: g.gatewayType,
      surcharge: g.surcharge.toNumber(),
      label: g.label ?? null,
      paypalUrl: undefined as string | undefined,
    };
    if (g.gatewayType === GatewayType.PAYPAL) {
      try {
        const config = decryptJson<PayPalConfig>(g.configJson);
        const amount = (invoice.total.toNumber() * (1 + g.surcharge.toNumber() / 100)).toFixed(2);
        base.paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(config.email)}&amount=${amount}&currency_code=${invoice.currency.code}&item_name=${encodeURIComponent(`Invoice ${invoice.number}`)}`;
      } catch {
        // configJson not set yet — PayPal button won't render
      }
    }
    return base;
  });

  // Load public comments
  const comments = await db.comment.findMany({
    where: { invoiceId: invoice.id, isPrivate: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, authorName: true, createdAt: true },
  });

  const isPayable = PAYABLE_STATUSES.includes(invoice.status);

  const brandColor = invoice.organization.brandColor ?? "#2563eb";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Org header */}
        <div className="text-center">
          {invoice.organization.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invoice.organization.logoUrl}
              alt={invoice.organization.name}
              className="mx-auto mb-3 h-12 w-auto max-w-[160px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-foreground">{invoice.organization.name}</h1>
        </div>

        {/* Invoice card */}
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          {/* Invoice header */}
          <div className="px-6 py-5 text-white" style={{ backgroundColor: brandColor }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/70 text-sm uppercase tracking-wide">
                  {invoice.type === "ESTIMATE" ? "Estimate" : "Invoice"}
                </p>
                <p className="text-3xl font-bold mt-1">#{invoice.number}</p>
              </div>
              <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium", STATUS_BADGE[invoice.status].className)}>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_BADGE[invoice.status].dot)} />
                {STATUS_BADGE[invoice.status].label}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Bill to + dates */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Bill To</p>
                <p className="font-semibold text-foreground">{invoice.client.name}</p>
                {invoice.client.email && (
                  <p className="text-sm text-muted-foreground">{invoice.client.email}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Invoice Date</p>
                <p className="text-sm text-foreground mb-3">{formatDate(invoice.date)}</p>
                {invoice.dueDate && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Due Date</p>
                    <p className="text-sm text-foreground">{formatDate(invoice.dueDate)}</p>
                  </>
                )}
              </div>
            </div>

            {/* Line items */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-3">
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 text-right font-semibold">Qty</th>
                  <th className="pb-3 text-right font-semibold">Rate</th>
                  <th className="pb-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border/50">
                    <td className="py-3.5">
                      <p className="font-medium text-foreground">{line.name}</p>
                      {line.description && (
                        <p className="text-xs text-muted-foreground">{line.description}</p>
                      )}
                    </td>
                    <td className="py-3.5 text-right text-muted-foreground">
                      {Number(line.qty).toFixed(2)}
                    </td>
                    <td className="py-3.5 text-right text-muted-foreground">{f(line.rate)}</td>
                    <td className="py-3.5 text-right font-medium text-foreground">
                      {f(line.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-60 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{f(invoice.subtotal)}</span>
                </div>
                {Number(invoice.discountTotal) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Discount</span>
                    <span>-{f(invoice.discountTotal)}</span>
                  </div>
                )}
                {Number(invoice.taxTotal) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax</span>
                    <span>{f(invoice.taxTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/50 pt-2 text-base font-bold text-foreground">
                  <span>Total</span>
                  <span className="font-display">{f(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="rounded-xl bg-accent/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {/* Estimate accept/decline */}
            {invoice.type === "ESTIMATE" && (
              <EstimateActions
                invoiceId={invoice.id}
                token={token}
                currentStatus={invoice.status}
              />
            )}
          </div>
        </div>

        {/* Payment history */}
        {invoice.payments.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Payment History</h2>
              <Button asChild variant="ghost" size="sm">
                <a href={`/api/portal/${token}/pdf`} download>
                  <Download className="h-3.5 w-3.5" />
                  Download Receipt
                </a>
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Method</th>
                  <th className="pb-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
                    <td className="py-3.5 capitalize text-muted-foreground">{p.method}</td>
                    <td className="py-3.5 text-right font-medium text-foreground">
                      {f(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment buttons */}
        {isPayable && gateways.length > 0 && (
          <PaymentButtons
            token={token}
            gateways={gateways}
            total={f(invoice.total)}
            orgName={invoice.organization.name}
          />
        )}

        {/* Comments */}
        <PortalComments
          token={token}
          initialComments={comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorName: c.authorName ?? "Client",
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
