"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { ChevronLeft } from "lucide-react";
import { CollectionsReminderDialog } from "@/components/reports/CollectionsReminderDialog";

const BAND_STYLES: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700",
  moderate: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  severe: "bg-red-50 text-red-700",
};

const ACTION_LABELS: Record<string, string> = {
  monitor: "Monitor",
  pre_due_nudge: "Pre-due nudge",
  reminder: "Send reminder",
  firm_reminder: "Firm reminder",
  final_notice: "Final notice",
  escalate: "Escalate (call)",
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CollectionsPage() {
  const { data, isLoading, error } = trpc.analytics.collectionsRisk.useQuery();
  const [reminder, setReminder] = useState<{ id: string; number: string } | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Smart Collections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open invoices ranked by predicted late-payment risk, with a recommended escalation
          action and tone for each. Action-due invoices first.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Scoring invoices…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && data.invoices.length === 0 && (
        <p className="text-sm text-muted-foreground">No open invoices to chase. 🎉</p>
      )}

      {data && data.invoices.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50">
                <tr className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2 text-left">Invoice</th>
                  <th className="px-5 py-2 text-left">Client</th>
                  <th className="px-5 py-2 text-right">Balance</th>
                  <th className="px-5 py-2 text-right">Overdue</th>
                  <th className="px-5 py-2 text-right">Late risk</th>
                  <th className="px-5 py-2 text-left">Recommended</th>
                  <th className="px-5 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.invoiceId} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3 font-medium">#{inv.invoiceNumber}</td>
                    <td className="px-5 py-3">{inv.clientName}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{usd(inv.balance)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-md ${BAND_STYLES[inv.band]}`}
                      >
                        {inv.lateRiskPercent}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-medium">{ACTION_LABELS[inv.recommendedAction]}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">({inv.recommendedTone})</span>
                      {inv.daysSinceLastReminder !== null && (
                        <span className="block text-[11px] text-muted-foreground">
                          Reminded {inv.daysSinceLastReminder === 0 ? "today" : `${inv.daysSinceLastReminder}d ago`}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setReminder({ id: inv.invoiceId, number: inv.invoiceNumber })}
                        className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                      >
                        Send reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CollectionsReminderDialog
        invoiceId={reminder?.id ?? null}
        invoiceNumber={reminder?.number}
        onClose={() => setReminder(null)}
      />
    </div>
  );
}
