import { cn } from "@/lib/utils";

type Props = {
  collectedThisMonth: number;
  outstandingAR: number;
  expensesThisMonth: number;
};

export function CashFlowWidget({ collectedThisMonth, outstandingAR, expensesThisMonth }: Props) {
  const total = collectedThisMonth + outstandingAR;
  const pct = total > 0 ? Math.round((collectedThisMonth / total) * 100) : 0;
  const net = collectedThisMonth - expensesThisMonth;

  // SVG ring: r=26, circumference = 2π*26 ≈ 163.4
  const CIRC = 163.4;
  const dashOffset = CIRC - (pct / 100) * CIRC;

  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          This Month
        </p>
        <p className="text-sm font-semibold mt-0.5">Cash Flow</p>
      </div>
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Progress ring */}
        <div className="relative w-16 h-16 shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle
              cx="32" cy="32" r="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              className="text-border"
            />
            <circle
              cx="32" cy="32" r="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              className="text-primary transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs font-bold tabular-nums">{pct}%</span>
            <span className="text-[9px] text-muted-foreground font-medium">collected</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {[
            { label: "Invoiced", value: fmt(total), color: "" },
            { label: "Collected", value: fmt(collectedThisMonth), color: "text-emerald-600" },
            { label: "Expenses", value: `−${fmt(expensesThisMonth)}`, color: "text-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center text-xs gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("font-mono font-medium tabular-nums", color)}>{value}</span>
            </div>
          ))}
          <div className="h-px bg-border/60 my-1" />
          <div className="flex justify-between items-center text-xs gap-2">
            <span className="font-semibold">Net</span>
            <span className={cn("font-mono font-semibold tabular-nums", net >= 0 ? "text-emerald-600" : "text-red-500")}>
              {net < 0 ? "−" : ""}{fmt(net)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
