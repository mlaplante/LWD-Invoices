import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { TaxBasisToggle } from "@/components/reports/TaxBasisToggle";

export default async function TaxLiabilityReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw = params.to ? new Date(params.to) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  const basis = params.basis === "cash" ? "cash" as const : "accrual" as const;

  const [data, org] = await Promise.all([
    api.reports.taxLiability({ from, to, basis }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const exportParams = (() => {
    const p = new URLSearchParams();
    if (params.from) p.set("from", params.from);
    if (params.to) p.set("to", params.to);
    p.set("basis", basis);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  })();

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Tax Liability Report"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`${dateRange} (${basis === "cash" ? "Cash Basis" : "Accrual Basis"})`}
      />

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
          <h1 className="text-xl font-bold tracking-tight">Tax Liability</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/reports/tax-liability/export${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <a
            href={`/api/reports/tax-liability/pdf${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </a>
          <PrintReportButton />
        </div>
      </div>

      <ReportFilters basePath="/reports/tax-liability" from={params.from} to={params.to}>
        <TaxBasisToggle basis={basis} />
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Tax Liability</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.grandTotal.toFixed(2)}</p>
        </div>
        {data.summary.slice(0, 3).map((s) => (
          <div key={s.taxName} className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium truncate">
              {s.taxName} ({s.taxRate}%)
            </p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${s.totalCollected.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.invoiceCount} invoices</p>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</p>
          <p className="text-base font-semibold mt-0.5">Tax by Invoice</p>
        </div>

        {data.details.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No tax data for the selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Total</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax Amount</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.details.map((d, i) => (
                <tr key={i} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{d.invoiceNumber}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{d.clientName}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {new Date(d.invoiceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-6 py-3.5 text-right tabular-nums">${d.invoiceTotal.toFixed(2)}</td>
                  <td className="px-6 py-3.5">{d.taxName}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums">{d.taxRate}%</td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">${d.taxAmount.toFixed(2)}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                      {d.paymentStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {d.paymentDate
                      ? new Date(d.paymentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              <tr>
                <td colSpan={6} className="px-6 py-3 text-sm font-semibold text-right">Total Tax</td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${data.grandTotal.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
