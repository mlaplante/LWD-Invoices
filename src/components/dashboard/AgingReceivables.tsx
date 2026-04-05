import { cn } from "@/lib/utils";

type AgingBucket = {
  label: string;
  total: number;
  count: number;
};

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const BUCKET_COLORS = [
  "bg-emerald-500",
  "bg-amber-400",
  "bg-orange-500",
  "bg-red-500",
  "bg-red-700",
];

export function AgingReceivables({ data }: { data: AgingBucket[] }) {
  const grandTotal = data.reduce((s, b) => s + b.total, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">Aging Receivables</h3>

      {grandTotal === 0 ? (
        <p className="text-sm text-muted-foreground">No outstanding invoices</p>
      ) : (
        <>
          <div className="flex h-3 rounded-full overflow-hidden mb-4">
            {data.map((bucket, i) =>
              bucket.total > 0 ? (
                <div
                  key={bucket.label}
                  className={cn("transition-all", BUCKET_COLORS[i])}
                  style={{ width: `${(bucket.total / grandTotal) * 100}%` }}
                  title={`${bucket.label}: ${fmt(bucket.total)}`}
                />
              ) : null
            )}
          </div>

          <div className="space-y-2">
            {data.map((bucket, i) => (
              <div key={bucket.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-full", BUCKET_COLORS[i])} />
                  <span className="text-muted-foreground">{bucket.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{bucket.count} inv</span>
                  <span className="font-medium w-20 text-right">{fmt(bucket.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
