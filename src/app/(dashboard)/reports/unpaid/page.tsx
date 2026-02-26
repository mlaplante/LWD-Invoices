import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { InvoiceStatus } from "@/generated/prisma";
import { PrintReportButton } from "@/components/reports/PrintReportButton";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SENT:           { label: "Unpaid",  className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID: { label: "Partial", className: "bg-blue-50 text-blue-600" },
  OVERDUE:        { label: "Overdue", className: "bg-red-50 text-red-600" },
};

export default async function UnpaidReportPage() {
  const invoices = await api.reports.unpaidInvoices({});

  // Group totals by currency to avoid mixing currency values
  const totalsByCurrency: Record<string, { symbol: string; symbolPosition: string; total: number }> = {};
  for (const inv of invoices) {
    const key = inv.currency.code ?? inv.currency.symbol;
    if (!totalsByCurrency[key]) {
      totalsByCurrency[key] = { symbol: inv.currency.symbol, symbolPosition: inv.currency.symbolPosition, total: 0 };
    }
    totalsByCurrency[key].total += Number(inv.total);
  }
  const currencyTotals = Object.values(totalsByCurrency);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 print:hidden"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Reports
          </Link>
          <span className="text-border/70 print:hidden">/</span>
          <h1 className="text-xl font-bold tracking-tight">Unpaid Invoices</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Summary stat */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Outstanding</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{invoices.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Overdue</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-red-600">
            {invoices.filter((i) => i.status === "OVERDUE").length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Unpaid
          </p>
          <p className="text-base font-semibold mt-0.5">Outstanding Invoices</p>
        </div>

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-emerald-600">All invoices paid!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Due</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {invoices.map((inv) => {
                const badge = STATUS_BADGE[inv.status as InvoiceStatus] ?? { label: inv.status, className: "bg-gray-100 text-gray-500" };
                return (
                  <tr key={inv.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/invoices/${inv.id}`} className="font-semibold hover:text-primary transition-colors">
                        #{inv.number}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-muted-foreground">{inv.client.name}</td>
                    <td className="px-6 py-3.5">
                      <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold", badge.className)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-muted-foreground">
                      {inv.dueDate
                        ? formatDistanceToNow(new Date(inv.dueDate), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                      {inv.currency.symbol}{Number(inv.total).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              {currencyTotals.map((ct, i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-right">
                    {i === 0 ? "Total Outstanding" : ""}
                  </td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">
                    {ct.symbolPosition === "after"
                      ? `${ct.total.toFixed(2)}${ct.symbol}`
                      : `${ct.symbol}${ct.total.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
