import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarClock, Settings } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import { EstimatedTaxPayments } from "@/components/reports/EstimatedTaxPayments";

export default async function EstimatedTaxReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const parsedYear = params.year ? parseInt(params.year, 10) : NaN;
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : now.getUTCFullYear();

  const [data, org] = await Promise.all([
    api.reports.estimatedTax({ year }),
    api.organization.get(),
  ]);

  const symbol = data.currencySymbol;
  const money = (n: number) =>
    `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-5">
      <ReportHeader
        title="Estimated Taxes"
        orgName={org.name}
        logoUrl={org.logoUrl}
        dateRange={`${year} · Cash Basis · Set-aside ${data.setAsidePercent}%`}
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
          <h1 className="text-xl font-bold tracking-tight">Estimated Taxes</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/estimated-tax"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
          <PrintReportButton />
        </div>
      </div>

      {/* Year switcher */}
      <div className="flex items-center gap-2 print:hidden">
        <Link
          href={`/reports/estimated-tax?year=${year - 1}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm hover:bg-accent/30"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {year - 1}
        </Link>
        <span className="rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold">{year}</span>
        <Link
          href={`/reports/estimated-tax?year=${year + 1}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm hover:bg-accent/30"
        >
          {year + 1}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Next-due callout */}
      {data.nextDue && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-6 py-5 flex items-start gap-4">
          <CalendarClock className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-900">
              Next payment due {fmtDate(data.nextDue.dueDate)} ({data.nextDue.label}) ·{" "}
              {data.nextDue.daysUntil} day{data.nextDue.daysUntil === 1 ? "" : "s"} away
            </p>
            <p className="text-sm text-orange-800 mt-0.5">
              {data.nextDue.paid > 0 ? "Remaining" : "Recommended"} payment for this quarter:{" "}
              <span className="font-bold tabular-nums">{money(data.nextDue.remaining)}</span>
              {data.nextDue.paid > 0 && (
                <span className="text-orange-700"> · {money(data.nextDue.paid)} already paid</span>
              )}
            </p>
            {!data.enabled && (
              <p className="text-xs text-orange-700 mt-2">
                Want a heads-up before each deadline?{" "}
                <Link href="/settings/estimated-tax" className="underline">
                  Turn on reminder emails
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      )}

      {/* YTD summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Net SE Income (YTD)</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{money(data.ytd.netIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {money(data.ytd.grossIncome)} − {money(data.ytd.deductibleExpenses + data.ytd.mileageDeduction)} deductions
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">
            Recommended Set-aside ({data.setAsidePercent}%)
          </p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-orange-600">
            {money(data.ytd.recommendedSetAside)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Paid YTD</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{money(data.ytd.paid)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            SE tax est. {money(data.ytd.seTaxEstimate)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Remaining to Set Aside</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-orange-600">
            {money(data.ytd.remaining)}
          </p>
        </div>
      </div>

      {/* Quarterly breakdown */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quarters</p>
          <p className="text-base font-semibold mt-0.5">Net income &amp; set-aside by IRS period</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="px-6 py-3 text-left">Quarter</th>
              <th className="px-6 py-3 text-left">Due</th>
              <th className="px-6 py-3 text-right">Income</th>
              <th className="px-6 py-3 text-right">Deductions</th>
              <th className="px-6 py-3 text-right">Net</th>
              <th className="px-6 py-3 text-right">Recommended</th>
              <th className="px-6 py-3 text-right">Paid</th>
              <th className="px-6 py-3 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {data.quarters.map((q) => {
              const isNext = data.nextDue?.quarter === q.quarter;
              return (
                <tr
                  key={q.quarter}
                  className={`transition-colors ${isNext ? "bg-orange-50/60" : "hover:bg-accent/20"}`}
                >
                  <td className="px-6 py-3.5 font-medium">
                    {q.label}
                    {isNext && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                        Next
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">{fmtDate(q.dueDate)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums">{money(q.grossIncome)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-muted-foreground">
                    {money(q.deductibleExpenses + q.mileageDeduction)}
                  </td>
                  <td className="px-6 py-3.5 text-right tabular-nums font-medium">{money(q.netIncome)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums">{money(q.recommendedSetAside)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums text-emerald-600">{money(q.paid)}</td>
                  <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-orange-600">
                    {money(q.remaining)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-right">
                Year to date
              </td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">{money(data.ytd.netIncome)}</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">
                {money(data.ytd.recommendedSetAside)}
              </td>
              <td className="px-6 py-3 text-right font-bold tabular-nums text-emerald-600">
                {money(data.ytd.paid)}
              </td>
              <td className="px-6 py-3 text-right font-bold tabular-nums text-orange-600">
                {money(data.ytd.remaining)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <EstimatedTaxPayments year={year} currencySymbol={symbol} />

      <p className="text-xs text-muted-foreground max-w-2xl">
        Cash basis: income counts when payment is received; only categorized,
        deductible expenses and logged mileage reduce net income. The
        self-employment tax line is guidance only (15.3% on 92.35% of net, ignoring
        the Social Security wage-base cap and the deductible-half adjustment). This
        is a planning aid, not tax advice — confirm amounts and deadlines with your
        accountant or the IRS.
      </p>
    </div>
  );
}
