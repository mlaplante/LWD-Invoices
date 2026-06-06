"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Lock,
  LockOpen,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The last 12 fully-elapsed months, newest first. */
function recentClosablePeriods(now = new Date()): Array<{ year: number; month: number; label: string }> {
  const out: Array<{ year: number; month: number; label: string }> = [];
  // Start from the previous month (the most recent elapsed one).
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-11 → previous month in 1-12 terms
  if (m === 0) {
    y -= 1;
    m = 12;
  }
  for (let i = 0; i < 12; i++) {
    out.push({ year: y, month: m, label: `${MONTHS[m - 1]} ${y}` });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

function money(symbol: string, n: number): string {
  return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SEVERITY_STYLE = {
  ok: { badge: "bg-emerald-50 text-emerald-600", icon: CheckCircle2, label: "OK" },
  warning: { badge: "bg-amber-50 text-amber-600", icon: TriangleAlert, label: "Warning" },
  error: { badge: "bg-red-50 text-red-600", icon: AlertTriangle, label: "Blocking" },
} as const;

export function MonthEndClose() {
  const periods = useMemo(() => recentClosablePeriods(), []);
  const [selected, setSelected] = useState(`${periods[0].year}-${periods[0].month}`);
  const [year, month] = selected.split("-").map(Number);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, isFetching } = trpc.monthEndClose.preview.useQuery({ year, month });

  const closeMutation = trpc.monthEndClose.close.useMutation({
    onSuccess: () => {
      utils.monthEndClose.preview.invalidate();
      utils.monthEndClose.list.invalidate();
      toast.success("Period closed");
      setConfirmOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const reopenMutation = trpc.monthEndClose.reopen.useMutation({
    onSuccess: () => {
      utils.monthEndClose.preview.invalidate();
      utils.monthEndClose.list.invalidate();
      toast.success("Period reopened");
      setReopenOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const report = data?.report;
  const existing = data?.existing;
  const isClosed = existing?.status === "CLOSED";
  const summary = report?.summary;

  return (
    <div className="space-y-5">
      {/* Period selector + status */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium"
        >
          {periods.map((p) => (
            <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
              {p.label}
            </option>
          ))}
        </select>

        {existing && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              isClosed ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-600",
            )}
          >
            {isClosed ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
            {isClosed ? "Closed" : "Reopened"}
            {existing.closedAt && ` · ${formatDateTime(existing.closedAt)}`}
            {existing.closedByLabel && ` by ${existing.closedByLabel}`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isClosed ? (
            <Button variant="outline" onClick={() => setReopenOpen(true)} disabled={reopenMutation.isPending}>
              <LockOpen className="w-4 h-4" /> Reopen
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!report || !report.periodElapsed || closeMutation.isPending}
            >
              <Lock className="w-4 h-4" /> Close {report?.period.label ?? "month"}
            </Button>
          )}
        </div>
      </div>

      {isLoading || !report ? (
        <div className="h-64 rounded-2xl border border-border/50 bg-card animate-pulse" />
      ) : (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-60")}>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Invoiced" value={money(report.currencySymbol, report.totals.invoiced)} />
            <Stat label="Collected" value={money(report.currencySymbol, report.totals.collected)} />
            <Stat label="Refunded" value={money(report.currencySymbol, report.totals.refunded)} />
            <Stat
              label="Net cash"
              value={money(report.currencySymbol, report.totals.netCash)}
              emphasize
            />
          </div>

          {/* Narrative + readiness */}
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm leading-relaxed">{report.narrative}</p>
                {summary && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={summary.canClose ? "secondary" : "destructive"}>
                      {summary.canClose ? "Ready to close" : `${summary.errorCount} blocking issue(s)`}
                    </Badge>
                    {summary.warningCount > 0 && (
                      <Badge variant="outline">{summary.warningCount} warning(s)</Badge>
                    )}
                    {summary.adjustmentCount > 0 && (
                      <Badge variant="outline">{summary.adjustmentCount} adjusting entr(ies)</Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reconciliation */}
          <Section title="Reconciliation">
            <div className="divide-y divide-border/40">
              {report.reconciliation.map((item) => {
                const style = SEVERITY_STYLE[item.severity];
                const Icon = style.icon;
                return (
                  <div key={item.check} className="flex items-start gap-3 px-5 py-3.5">
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 mt-0.5",
                        item.severity === "error"
                          ? "text-red-500"
                          : item.severity === "warning"
                            ? "text-amber-500"
                            : "text-emerald-500",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        {item.amount != null && item.amount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {money(report.currencySymbol, item.amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.detail}</p>
                      {item.refs.length > 0 && (
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                          {item.refs.slice(0, 8).join(", ")}
                          {item.refs.length > 8 ? ` +${item.refs.length - 8} more` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Anomalies */}
          {(report.anomalies.duplicates.length > 0 || report.anomalies.outliers.length > 0) && (
            <Section title="Flagged anomalies">
              <div className="divide-y divide-border/40">
                {report.anomalies.duplicates.map((d, i) => (
                  <AnomalyRow key={`dup-${i}`} severity={d.severity} message={d.message} />
                ))}
                {report.anomalies.outliers.map((o) => (
                  <AnomalyRow key={`out-${o.expenseId}`} severity={o.severity} message={o.message} />
                ))}
              </div>
            </Section>
          )}

          {/* Drafted adjusting entries */}
          {report.adjustments.length > 0 && (
            <Section title="Drafted adjusting entries" subtitle="Review and apply — nothing is booked automatically.">
              <div className="divide-y divide-border/40">
                {report.adjustments.map((a, i) => (
                  <div key={`${a.kind}-${i}`} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="text-sm font-semibold">
                        {money(report.currencySymbol, a.amount)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{a.description}</p>
                    <p className="text-xs text-primary/80 mt-1.5 inline-flex items-center gap-1">
                      <CircleDot className="w-3 h-3" /> {a.suggestedAction}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!report.periodElapsed && (
            <p className="text-sm text-amber-600 inline-flex items-center gap-1.5">
              <TriangleAlert className="w-4 h-4" /> This month hasn&apos;t finished yet — you can preview
              the close but not lock it until the period ends.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Close ${report?.period.label ?? "the period"}?`}
        description={
          summary && !summary.canClose
            ? `This period has ${summary.errorCount} blocking issue(s). Closing now will lock the books with those exceptions acknowledged. You can reopen later if needed.`
            : "This freezes the reconciliation snapshot and locks the period. You can reopen it later if needed."
        }
        loading={closeMutation.isPending}
        destructive={!!summary && !summary.canClose}
        onConfirm={() =>
          closeMutation.mutate({ year, month, force: !!summary && !summary.canClose })
        }
      />

      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${report?.period.label ?? "the period"}?`}
        description="Reopening unlocks the period for edits. The existing snapshot is preserved; re-closing will refresh it."
        loading={reopenMutation.isPending}
        onConfirm={() => reopenMutation.mutate({ year, month })}
      />
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold", emphasize ? "text-xl text-primary" : "text-lg")}>{value}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border/50">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function AnomalyRow({ severity, message }: { severity: "warning" | "danger"; message: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <AlertTriangle
        className={cn("w-4 h-4 shrink-0 mt-0.5", severity === "danger" ? "text-red-500" : "text-amber-500")}
      />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
