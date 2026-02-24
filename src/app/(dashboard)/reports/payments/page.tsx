import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft, CreditCard, Landmark, DollarSign, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

const GATEWAY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  STRIPE:        { label: "Stripe",        icon: <CreditCard className="w-4 h-4" />, color: "bg-violet-50 text-violet-600" },
  PAYPAL:        { label: "PayPal",        icon: <DollarSign className="w-4 h-4" />, color: "bg-blue-50 text-blue-600" },
  BANK_TRANSFER: { label: "Bank Transfer", icon: <Landmark className="w-4 h-4" />,   color: "bg-emerald-50 text-emerald-600" },
  CASH:          { label: "Cash",          icon: <Banknote className="w-4 h-4" />,   color: "bg-amber-50 text-amber-600" },
};

export default async function PaymentsReportPage() {
  const byGateway = await api.reports.paymentsByGateway({});
  const entries = Object.entries(byGateway);

  const totalRevenue = entries.reduce((sum, [, s]) => sum + s.total, 0);
  const totalFees = entries.reduce((sum, [, s]) => sum + s.fees, 0);
  const totalTxns = entries.reduce((sum, [, s]) => sum + s.count, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/reports"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Reports
        </Link>
        <span className="text-border/70">/</span>
        <h1 className="text-xl font-bold tracking-tight">Payments by Gateway</h1>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Transactions</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums">{totalTxns}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Gateway Fees</p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums text-red-600">-${totalFees.toFixed(2)}</p>
        </div>
      </div>

      {/* Gateway breakdown */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card flex flex-col items-center justify-center py-14 text-center">
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([method, stats]) => {
            const config = GATEWAY_CONFIG[method] ?? {
              label: method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              icon: <CreditCard className="w-4 h-4" />,
              color: "bg-gray-100 text-gray-500",
            };
            const net = stats.total - stats.fees;
            return (
              <div key={method} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", config.color)}>
                    {config.icon}
                  </div>
                  <p className="font-semibold">{config.label}</p>
                </div>
                <div className="px-5 py-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transactions</span>
                    <span className="font-semibold tabular-nums">{stats.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Revenue</span>
                    <span className="font-semibold tabular-nums">${stats.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gateway Fees</span>
                    <span className="font-semibold tabular-nums text-red-600">-${stats.fees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/40 pt-2.5">
                    <span className="font-semibold">Net Revenue</span>
                    <span className="font-bold tabular-nums">${net.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
