import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  data: { includedHours: number; usedHours: number; periodCount: number };
};

export function RetainerBurnCard({ data }: Props) {
  const { includedHours, usedHours, periodCount } = data;

  if (periodCount === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-purple-500" />
          <h3 className="font-semibold text-sm">Retainer Burn</h3>
        </div>
        <p className="text-sm text-muted-foreground">No active retainer periods</p>
      </div>
    );
  }

  const pct = includedHours > 0 ? Math.min((usedHours / includedHours) * 100, 100) : 0;
  const isOverBurn = usedHours > includedHours;
  const remaining = Math.max(includedHours - usedHours, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-purple-500" />
          Retainer Burn
        </h3>
        {isOverBurn && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-red-50 text-red-700">
            Over budget
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Used</span>
          <span className={cn("font-semibold", isOverBurn && "text-red-600")}>
            {usedHours.toFixed(1)}h / {includedHours.toFixed(1)}h
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isOverBurn ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-purple-500",
            )}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(pct)}% of retainer hours used`}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(pct)}% used</span>
          {!isOverBurn && <span>{remaining.toFixed(1)}h remaining</span>}
          {isOverBurn && (
            <span className="text-red-600 font-medium">
              {(usedHours - includedHours).toFixed(1)}h over
            </span>
          )}
        </div>

        {periodCount > 1 && (
          <p className="text-xs text-muted-foreground">
            Across {periodCount} active period{periodCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
