import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { PaymentButtons } from "@/components/portal/PaymentButtons";
import { PortalComments } from "@/components/portal/PortalComments";
import { EstimateActions } from "@/components/portal/EstimateActions";
import { decryptJson } from "@/server/services/encryption";
import type { PayPalConfig } from "@/server/services/gateway-config";
import { GatewayType, type InvoiceStatus } from "@/generated/prisma";

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
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-2xl font-bold text-gray-900">{invoice.organization.name}</h1>
        </div>

        {/* Invoice card */}
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          {/* Invoice header */}
          <div className="px-6 py-5 text-white" style={{ backgroundColor: brandColor }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/70 text-sm uppercase tracking-wide">
                  {invoice.type === "ESTIMATE" ? "Estimate" : "Invoice"}
                </p>
                <p className="text-3xl font-bold mt-1">#{invoice.number}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[invoice.status]}`}
              >
                {invoice.status.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Bill to + dates */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs uppercase text-gray-400 mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{invoice.client.name}</p>
                {invoice.client.email && (
                  <p className="text-sm text-gray-500">{invoice.client.email}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-gray-400 mb-1">Invoice Date</p>
                <p className="text-sm text-gray-900 mb-3">{formatDate(invoice.date)}</p>
                {invoice.dueDate && (
                  <>
                    <p className="text-xs uppercase text-gray-400 mb-1">Due Date</p>
                    <p className="text-sm text-gray-900">{formatDate(invoice.dueDate)}</p>
                  </>
                )}
              </div>
            </div>

            {/* Line items */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-400">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{line.name}</p>
                      {line.description && (
                        <p className="text-xs text-gray-500">{line.description}</p>
                      )}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {Number(line.qty).toFixed(2)}
                    </td>
                    <td className="py-3 text-right text-gray-600">{f(line.rate)}</td>
                    <td className="py-3 text-right font-medium text-gray-900">
                      {f(line.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-60 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{f(invoice.subtotal)}</span>
                </div>
                {Number(invoice.discountTotal) > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Discount</span>
                    <span>-{f(invoice.discountTotal)}</span>
                  </div>
                )}
                {Number(invoice.taxTotal) > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Tax</span>
                    <span>{f(invoice.taxTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-bold text-gray-900">
                  <span>Total</span>
                  <span>{f(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="rounded bg-gray-50 p-4">
                <p className="text-xs uppercase text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
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
          <div className="rounded-lg border bg-white shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Payment History</h2>
              <a
                href={`/api/portal/${token}/pdf`}
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Receipt
              </a>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-400">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-600">{formatDate(p.paidAt)}</td>
                    <td className="py-2 capitalize text-gray-600">{p.method}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
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
