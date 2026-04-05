import { TrendingUp, TrendingDown } from "lucide-react";

type ConversionData = {
  thisMonth: { sent: number; accepted: number; rate: number | null };
  lastMonth: { sent: number; accepted: number; rate: number | null };
};

export function EstimateConversion({ data }: { data: ConversionData }) {
  const { thisMonth, lastMonth } = data;
  const trend =
    thisMonth.rate !== null && lastMonth.rate !== null
      ? thisMonth.rate - lastMonth.rate
      : null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">Estimate Conversion</h3>

      <div className="flex items-end gap-2 mb-2">
        <span className="font-display text-3xl leading-none">
          {thisMonth.rate !== null ? `${thisMonth.rate}%` : "—"}
        </span>
        {trend !== null && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-emerald-600" : "text-red-600"}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend > 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">{thisMonth.sent}</span> sent
        </div>
        <div>
          <span className="font-medium text-foreground">{thisMonth.accepted}</span> accepted
        </div>
      </div>
    </div>
  );
}
