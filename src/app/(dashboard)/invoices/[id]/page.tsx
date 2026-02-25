import { api } from "@/trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { RecordPaymentButton } from "@/components/invoices/RecordPaymentButton";
import { SendInvoiceButton } from "@/components/invoices/SendInvoiceButton";
import { ApplyCreditNoteDialog } from "@/components/invoices/ApplyCreditNoteDialog";
import { InvoiceComments } from "@/components/invoices/InvoiceComments";
import { RecurringInvoiceDialog } from "@/components/invoices/RecurringInvoiceDialog";
import { AttachmentPanel } from "@/components/attachments/AttachmentPanel";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { ArrowLeft, Download, ExternalLink, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:         { label: "Draft",    className: "bg-gray-100 text-gray-500" },
  SENT:          { label: "Sent",     className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID:{ label: "Partial",  className: "bg-blue-50 text-blue-600" },
  PAID:          { label: "Paid",     className: "bg-emerald-50 text-emerald-600" },
  OVERDUE:       { label: "Overdue",  className: "bg-red-50 text-red-600" },
  ACCEPTED:      { label: "Accepted", className: "bg-primary/10 text-primary" },
  REJECTED:      { label: "Rejected", className: "bg-gray-100 text-gray-400" },
};

const TYPE_LABEL: Record<InvoiceType, string> = {
  DETAILED:    "Invoice",
  SIMPLE:      "Invoice",
  ESTIMATE:    "Estimate",
  CREDIT_NOTE: "Credit Note",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | { toNumber(): number }, symbol: string, pos: string): string {
  const val = typeof n === "object" ? n.toNumber() : n;
  return pos === "before" ? `${symbol}${val.toFixed(2)}` : `${val.toFixed(2)}${symbol}`;
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

// ── Page ─────────────────────────────────────────────────────────────────────

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

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const portalLink = `${proto}://${host}/portal/${invoice.portalToken}`;
  const isPayable = PAYABLE_STATUSES.includes(invoice.status);
  const badge = STATUS_BADGE[invoice.status];
  const docType = TYPE_LABEL[invoice.type];

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/invoices"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Invoices
          </Link>
          <span className="text-border/70">/</span>
          <h1 className="text-xl font-bold tracking-tight truncate">
            #{invoice.number}
          </h1>
          <span
            className={cn(
              "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0",
              badge.className
            )}
          >
            {badge.label}
          </span>
        </div>

        {/* Contextual actions */}
        <div className="flex items-center gap-2 shrink-0">
          {(invoice.status === "DRAFT" || invoice.status === "SENT") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Link>
            </Button>
          )}
          {invoice.status === "DRAFT" && (
            <SendInvoiceButton invoiceId={invoice.id} />
          )}
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </a>
          </Button>
          <RecurringInvoiceDialog invoiceId={invoice.id} />
          <Button asChild variant="outline" size="sm">
            <a href={portalLink} target="_blank" rel="noreferrer">
              Portal
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </a>
          </Button>
          {invoice.type === "CREDIT_NOTE" ? null : (
            <ApplyCreditNoteDialog
              invoiceId={invoice.id}
              clientId={invoice.client.id}
            />
          )}
          {isPayable && (
            <RecordPaymentButton
              invoiceId={invoice.id}
              invoiceTotal={Number(invoice.total)}
            />
          )}
        </div>
      </div>

      {/* ── Invoice document card ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">

        {/* Top banner: org name (left) + metadata grid (right) */}
        <div className="grid grid-cols-[1fr_auto] gap-10 px-8 pt-8 pb-6 border-b border-border/50">
          <div>
            {invoice.organization.logoUrl && (
              <img
                src={invoice.organization.logoUrl}
                alt={invoice.organization.name}
                className="mb-3 h-10 w-auto max-w-[160px] object-contain"
              />
            )}
            <p className="text-2xl font-extrabold tracking-tight leading-tight">
              {invoice.organization.name}
            </p>
            <p className="text-sm text-muted-foreground mt-1 font-medium">{docType}</p>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm self-start">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-semibold text-right">#{invoice.number}</span>

            <span className="text-muted-foreground">Issue Date</span>
            <span className="text-right">{formatDate(invoice.date)}</span>

            {invoice.dueDate && (
              <>
                <span className="text-muted-foreground">Due Date</span>
                <span className="text-right">{formatDate(invoice.dueDate)}</span>
              </>
            )}

            <span className="text-muted-foreground">Amount</span>
            <span className="font-semibold text-right">{f(invoice.total)}</span>

            <span className="text-muted-foreground">Status</span>
            <span className="text-right">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                  badge.className
                )}
              >
                {badge.label}
              </span>
            </span>
          </div>
        </div>

        {/* Issue From / Issue For */}
        <div className="grid grid-cols-2 gap-6 px-8 py-5 border-b border-border/50 bg-muted/20">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Issue From
            </p>
            <p className="font-semibold text-foreground">{invoice.organization.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Issue For
            </p>
            <p className="font-semibold text-foreground">{invoice.client.name}</p>
            {invoice.client.email && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {invoice.client.email}
              </p>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-xs font-semibold text-muted-foreground">
                  Description
                </th>
                <th className="pb-3 text-right text-xs font-semibold text-muted-foreground">
                  Rate
                </th>
                <th className="pb-3 text-right text-xs font-semibold text-muted-foreground">
                  QTY
                </th>
                <th className="pb-3 text-right text-xs font-semibold text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-border/40">
                  <td className="py-4">
                    <p className="font-medium">{line.name}</p>
                    {line.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {line.description}
                      </p>
                    )}
                  </td>
                  <td className="py-4 text-right text-muted-foreground">
                    {f(line.rate)}
                  </td>
                  <td className="py-4 text-right text-muted-foreground">
                    {Number(line.qty).toFixed(2)}
                  </td>
                  <td className="py-4 text-right font-semibold">
                    {f(line.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals block — right-aligned */}
          <div className="flex justify-end mt-5">
            <div className="w-60 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium">{f(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discountTotal) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-emerald-600">
                    -{f(invoice.discountTotal)}
                  </span>
                </div>
              )}
              {Number(invoice.taxTotal) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Tax</span>
                  <span className="font-medium">{f(invoice.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3">
                <span className="font-bold text-base">Grand Total</span>
                <span className="font-bold text-base">{f(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mx-8 mb-8 rounded-xl border border-red-200/50 bg-red-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">
              Notes
            </p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>

      {/* ── Payment History ──────────────────────────────────────── */}
      {invoice.payments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Payment History</h2>
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["Date", "Method", "Reference", "Amount"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                        i === 3 ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">{formatDate(p.paidAt)}</td>
                    <td className="px-5 py-3 capitalize">{p.method}</td>
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                      {p.transactionId ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {f(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payment Schedule ─────────────────────────────────────── */}
      {invoice.partialPayments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Payment Schedule</h2>
          <div className="rounded-2xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {["#", "Due Date", "Amount", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                        i === 2 ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {invoice.partialPayments.map((pp, i) => (
                  <tr key={pp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3">{formatDate(pp.dueDate)}</td>
                    <td className="px-5 py-3 text-right font-medium">
                      {pp.isPercentage
                        ? `${Number(pp.amount).toFixed(0)}%`
                        : f(pp.amount)}
                    </td>
                    <td className="px-5 py-3">
                      {pp.isPaid ? (
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-600">
                          Paid {formatDate(pp.paidAt)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Comments ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 p-5">
        <InvoiceComments invoiceId={invoice.id} />
      </div>

      {/* ── Attachments ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 p-5">
        <AttachmentPanel context="INVOICE" contextId={invoice.id} />
      </div>
    </div>
  );
}
