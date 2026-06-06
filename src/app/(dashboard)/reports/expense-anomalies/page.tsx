"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { ChevronLeft, Copy, TrendingUp } from "lucide-react";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpenseAnomaliesPage() {
  const { data, isLoading, error } = trpc.analytics.expenseAnomalies.useQuery();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Expense Anomalies</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suspected duplicate receipts and spend that runs well above a supplier&apos;s typical
          amount, surfaced from your expense data.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Scanning expenses…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Scanned" value={String(data.summary.scanned)} />
            <Metric label="Duplicate groups" value={String(data.summary.duplicateCount)} />
            <Metric label="Outliers" value={String(data.summary.outlierCount)} />
            <Metric label="Duplicate exposure" value={usd(data.summary.duplicateExposure)} />
          </div>

          <Section
            title="Possible duplicates"
            icon={<Copy className="w-4 h-4" />}
            empty={data.duplicates.length === 0 ? "No duplicate receipts detected." : null}
          >
            {data.duplicates.map((d, i) => (
              <div key={i} className="px-5 py-3 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{d.supplierName}</span>
                  <span className="tabular-nums">{usd(d.amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{d.message}</p>
              </div>
            ))}
          </Section>

          <Section
            title="Amount outliers"
            icon={<TrendingUp className="w-4 h-4" />}
            empty={data.outliers.length === 0 ? "No out-of-pattern spend detected." : null}
          >
            {data.outliers.map((o) => (
              <div key={o.expenseId} className="px-5 py-3 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{o.supplierName}</span>
                  <span className="tabular-nums">
                    {usd(o.amount)} <span className="text-muted-foreground">({o.multiple}×)</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{o.message}</p>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="font-display text-2xl mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {empty ? <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p> : children}
    </div>
  );
}
