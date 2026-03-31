import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, Download, Repeat } from "lucide-react";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ExpenseCategoryFilter } from "@/components/reports/ExpenseCategoryFilter";

export default async function ExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const fromRaw = params.from ? new Date(params.from) : undefined;
  const toRaw   = params.to   ? new Date(params.to)   : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to   = toRaw   && !isNaN(toRaw.getTime())   ? toRaw   : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  const categoryId = params.categoryId ?? undefined;

  const [expenses, categories] = await Promise.all([
    api.reports.expenseBreakdown({ from, to, categoryId }),
    api.reports.expenseCategories(),
  ]);

  const totalAmount = expenses.reduce((sum, e) => sum + e.qty * Number(e.rate), 0);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.category?.name ?? "Uncategorized";
    byCategory[key] = (byCategory[key] ?? 0) + e.qty * Number(e.rate);
  }
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4);

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
          <h1 className="text-xl font-bold tracking-tight">Expense Breakdown</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/reports/expenses/export${(() => {
              const p = new URLSearchParams();
              if (params.from) p.set("from", params.from);
              if (params.to) p.set("to", params.to);
              if (params.categoryId) p.set("categoryId", params.categoryId);
              const qs = p.toString();
              return qs ? `?${qs}` : "";
            })()}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <PrintReportButton />
        </div>
      </div>

      <ReportFilters basePath="/reports/expenses" from={params.from} to={params.to}>
        <ExpenseCategoryFilter categories={categories} selected={categoryId} />
      </ReportFilters>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Expenses</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{expenses.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalAmount.toFixed(2)}</p>
        </div>
        {topCategories.slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium truncate">{cat}</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">${amt.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Expenses table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Expenses</p>
          <p className="text-base font-semibold mt-0.5">All Expenses</p>
        </div>

        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-3.5 font-medium">{e.name}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">
                    {e.project ? (
                      <Link href={`/projects/${e.project.id}`} className="hover:text-primary transition-colors">
                        {e.project.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">{e.category?.name ?? "—"}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{e.supplier?.name ?? "—"}</td>
                  <td className="px-6 py-3.5 text-center">
                    {e.recurringExpenseId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Repeat className="w-2.5 h-2.5" />
                        Recurring
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">One-time</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                    ${(e.qty * Number(e.rate)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/20">
              <tr>
                <td colSpan={5} className="px-6 py-3 text-sm font-semibold text-right">Total</td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
