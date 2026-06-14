import Link from "next/link";
import { Landmark, ChevronRight } from "lucide-react";

type Props = {
  data: {
    currencySymbol: string;
    ytdPaid: number;
    ytdRecommended: number;
    nextDue: {
      label: string;
      dueDateLabel: string;
      daysUntil: number;
      remaining: number;
    } | null;
  };
};

export function EstimatedTaxCard({ data }: Props) {
  const { currencySymbol, ytdPaid, ytdRecommended, nextDue } = data;
  const money = (n: number) =>
    `${currencySymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const urgent = nextDue !== null && nextDue.remaining > 0 && nextDue.daysUntil <= 14;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Landmark className="h-4 w-4 text-orange-500" />
          Estimated Taxes
        </h3>
        <Link
          href="/reports/estimated-tax"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Details <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Paid YTD</p>
          <p className="text-2xl font-bold tabular-nums mt-0.5">{money(ytdPaid)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">of {money(ytdRecommended)} recommended</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next payment due</p>
          {nextDue ? (
            <>
              <p className="text-2xl font-bold tabular-nums mt-0.5 text-orange-600">
                {money(nextDue.remaining)}
              </p>
              <p className={`text-xs mt-0.5 ${urgent ? "font-semibold text-orange-600" : "text-muted-foreground"}`}>
                {nextDue.dueDateLabel} · {nextDue.daysUntil}d ({nextDue.label})
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1.5">No upcoming deadline</p>
          )}
        </div>
      </div>
    </div>
  );
}
