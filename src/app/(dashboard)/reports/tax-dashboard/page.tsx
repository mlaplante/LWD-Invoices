import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { UNCATEGORIZED_LABEL } from "@/server/services/deductible-expenses";

export default async function TaxDashboardPage({
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
  const basis = params.basis === "accrual" ? ("accrual" as const) : ("cash" as const);

  const [data, org] = await Promise.all([
    api.reports.taxDashboard({ from, to, basis }),
    api.organization.get(),
  ]);

  const dateRange =
    from || to
      ? `${from ? from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Beginning"} — ${to ? to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present"}`
      : "All Time";

  const uncategorized = data.deductible.byCategory.find(
    (c) => c.category === UNCATEGORIZED_LABEL,
  );

  // Build basis toggle links preserving existing from/to params
  const basisParams = (newBasis: string) => {
    const p = new URLSearchParams();
    if (params.from) p.set("from", params.from);
    if (params.to) p.set("to", params.to);
    p.set("basis", newBasis);
    return `/reports/tax-dashboard?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Tax-Ready Dashboard"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`${dateRange} (${basis === "cash" ? "Cash Basis" : "Accrual Basis"})`}
      />

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
          <h1 className="text-xl font-bold tracking-tight">Tax-Ready Dashboard</h1>
        </div>
        <PrintReportButton />
      </div>

      <ReportFilters basePath="/reports/tax-dashboard" from={params.from} to={params.to}>
        {/* Basis toggle: plain links instead of TaxBasisToggle (which hard-codes /reports/tax-liability) */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5 print:hidden">
          <Link
            href={basisParams("accrual")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              basis === "accrual"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Accrual
          </Link>
          <Link
            href={basisParams("cash")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              basis === "cash"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cash
          </Link>
        </div>
      </ReportFilters>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Sales Tax Due</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.salesTaxDue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Gross Income</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${data.grossIncome.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Deductible Expenses</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">
            ${data.deductible.deductibleTotal.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Est. Net Income</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">
            ${data.estimatedNetIncome.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">
            1099 Exposure ({data.contractorExposure.year})
          </p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">
            ${data.contractorExposure.totalReportable.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.contractorExposure.eligibleCount} contractors
          </p>
        </div>
      </div>

      {/* Income by category */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Income</p>
          <p className="text-base font-semibold mt-0.5">By Service (ex-tax, cash collected)</p>
        </div>
        {data.incomeByCategory.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No income recorded for the selected period.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Service
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Invoices
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Share
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Income
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.incomeByCategory.map((r) => (
                <tr key={r.category} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{r.category}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">
                    {r.invoiceCount}
                  </td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">
                    {r.pct.toFixed(1)}%
                  </td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                    ${r.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deductible expenses */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Expenses
            </p>
            <p className="text-base font-semibold mt-0.5">Deductible by Category</p>
          </div>
          <Link
            href="/reports/expenses"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden"
          >
            Full breakdown <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {uncategorized && (
          <div className="px-6 py-3 bg-amber-50 text-amber-800 text-sm border-b border-amber-200">
            ${uncategorized.amount.toFixed(2)} of expenses are uncategorized and excluded from the
            deductible total — assign categories to include them.
          </div>
        )}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border/40">
            {data.deductible.byCategory.map((c) => (
              <tr key={c.category} className="hover:bg-accent/20 transition-colors">
                <td className="px-6 py-3.5 font-medium">{c.category}</td>
                <td className="px-6 py-3.5">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.deductible
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.deductible ? "Deductible" : "Non-deductible"}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                  ${c.amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-right">
                Total Deductible
              </td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">
                ${data.deductible.deductibleTotal.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sales tax + 1099 deep links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/reports/tax-liability"
          className="rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-center justify-between print:hidden"
        >
          <div>
            <p className="font-semibold text-sm">Sales Tax Detail</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${data.salesTaxDue.toFixed(2)} due — view by invoice
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link
          href="/reports/1099"
          className="rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/30 hover:bg-accent/30 transition-colors flex items-center justify-between print:hidden"
        >
          <div>
            <p className="font-semibold text-sm">1099 / Contractor Tax Pack</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.contractorExposure.eligibleCount} eligible
              {data.contractorExposure.missingW9Count > 0
                ? ` · ${data.contractorExposure.missingW9Count} missing W-9`
                : ""}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
