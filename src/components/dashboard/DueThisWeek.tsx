import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";

type DueInvoice = {
  id: string;
  number: string;
  clientName: string;
  total: number;
  remaining: number;
  dueDate: string;
  currencySymbol: string;
  symbolPosition: string;
};

function daysUntil(dateStr: string): number {
  const now = new Date();
  const due = new Date(dateStr);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function dueLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function DueThisWeek({ data }: { data: DueInvoice[] }) {
  const totalDue = data.reduce((s, inv) => s + inv.remaining, 0);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-amber-500" />
          Due This Week
        </h3>
        {data.length > 0 && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
            {data.length} invoice{data.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing due this week</p>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            {data.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    #{inv.number} — {inv.clientName}
                  </p>
                  <p className="text-xs text-muted-foreground">{dueLabel(inv.dueDate)}</p>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(inv.remaining, inv.currencySymbol, inv.symbolPosition)}
                </p>
              </Link>
            ))}
          </div>
          <div className="border-t border-border/50 pt-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Total due</span>
            <span className="text-sm font-bold">${totalDue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          </div>
        </>
      )}
    </div>
  );
}
