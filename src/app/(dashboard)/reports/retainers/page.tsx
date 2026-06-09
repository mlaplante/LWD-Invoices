import { api } from "@/trpc/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ReportHeader } from "@/components/reports/ReportHeader";
import type { RetainerBurndown } from "@/server/services/retainer-burndown";

function fmtDate(d: string): string {
  // projectedDepletionDate is a UTC calendar date ("YYYY-MM-DD"); pin to UTC so
  // it doesn't render a day early in non-UTC runtimes.
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RetainerRow({ row }: { row: RetainerBurndown }) {
  const pct = Math.min(row.pctUsed * 100, 100);
  const pctLabel = `${Math.round(row.pctUsed * 100)}%`;
  const remainingLabel =
    row.unit === "hours"
      ? `${row.remaining % 1 === 0 ? row.remaining : row.remaining.toFixed(1)}h`
      : `$${row.remaining.toFixed(2)}`;

  return (
    <div className="px-5 py-4 border-b border-border/50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-sm leading-snug">{row.clientName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{row.label}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.warning && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
              80% used
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${row.warning ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums font-semibold w-10 text-right">{pctLabel}</span>
      </div>

      {/* Details row */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span>
          Remaining:{" "}
          <span className="font-medium text-foreground">{remainingLabel}</span>
        </span>
        <span>
          Depletes:{" "}
          <span className="font-medium text-foreground">
            {row.projectedDepletionDate ? fmtDate(row.projectedDepletionDate) : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

export default async function RetainerBurndownPage() {
  const [hours, money, org] = await Promise.all([
    api.hoursRetainers.burndown(),
    api.retainers.burndown(),
    api.organization.get(),
  ]);

  return (
    <div className="space-y-5">
      <ReportHeader title="Retainer Burn-down" orgName={org.name} logoUrl={org.logoUrl} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Retainer Burn-down</h1>
        </div>
        <PrintReportButton />
      </div>

      {/* Hours Retainers */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Hours Retainers
        </h2>
        {hours.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            No active hours retainers.
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            {hours.map((row) => (
              <RetainerRow key={row.retainerId} row={row} />
            ))}
          </div>
        )}
      </div>

      {/* Prepaid Retainers */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Prepaid Retainers
        </h2>
        {money.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            No prepaid retainers.
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            {money.map((row) => (
              <RetainerRow key={row.retainerId} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
