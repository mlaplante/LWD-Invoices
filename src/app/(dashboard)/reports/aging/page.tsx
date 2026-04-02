import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";

function fmt(n: number | { toNumber(): number }) {
  const v = typeof n === "object" ? n.toNumber() : n;
  return v.toFixed(2);
}

export default async function AgingPage() {
  const [data, org] = await Promise.all([
    api.reports.invoiceAging(),
    api.organization.get(),
  ]);

  const buckets = [
    { key: "current" as const, label: "Current", color: "text-emerald-600", dotColor: "bg-emerald-500" },
    { key: "days1_30" as const, label: "1–30 days", color: "text-amber-600", dotColor: "bg-amber-500" },
    { key: "days31_60" as const, label: "31–60 days", color: "text-orange-600", dotColor: "bg-orange-500" },
    { key: "days61_90" as const, label: "61–90 days", color: "text-red-500", dotColor: "bg-red-500" },
    { key: "days90plus" as const, label: "90+ days", color: "text-red-700", dotColor: "bg-red-700" },
  ];

  return (
    <div className="space-y-5">
      <ReportHeader title="Invoice Aging" orgName={org.name} logoUrl={org.logoUrl} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Invoice Aging</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Summary bucket cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {buckets.map((b) => {
          const items = data[b.key];
          const total = items.reduce((s, i) => s + Number(i.total), 0);
          return (
            <div key={b.key} className="rounded-2xl border border-border/50 bg-card px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{b.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${b.color}`}>${total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{items.length} invoice{items.length !== 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>

      {/* Per-bucket tables — only render non-empty buckets */}
      {buckets.map((b) => {
        const items = data[b.key];
        if (items.length === 0) return null;
        return (
          <div key={b.key} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${b.dotColor}`} />
              <p className="text-sm font-semibold">{b.label}</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2 text-left">Invoice</th>
                  <th className="px-5 py-2 text-left">Client</th>
                  <th className="px-5 py-2 text-right">Due Date</th>
                  <th className="px-5 py-2 text-right">Days Overdue</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                    <td className="px-5 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:text-primary transition-colors">
                        #{inv.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{inv.client.name}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {inv.dueDate
                        ? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${b.color}`}>
                      {inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {inv.currency.symbol}{fmt(inv.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
