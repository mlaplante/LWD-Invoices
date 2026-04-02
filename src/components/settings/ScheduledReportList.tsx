"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

const REPORT_LABELS: Record<string, string> = {
  PROFIT_LOSS: "Profit & Loss",
  AGING: "Invoice Aging",
  UNPAID: "Unpaid Invoices",
  EXPENSES: "Expenses",
  TAX_LIABILITY: "Tax Liability",
};

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  onEdit: (id: string) => void;
};

export function ScheduledReportList({ onEdit }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: schedules = [] } = trpc.scheduledReports.list.useQuery();

  const deleteMutation = trpc.scheduledReports.delete.useMutation({
    onSuccess: () => {
      toast.success("Schedule deleted");
      utils.scheduledReports.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  if (schedules.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No scheduled reports yet. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipients</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Sent</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {schedules.map((s) => (
              <tr key={s.id} className="hover:bg-accent/20 transition-colors">
                <td className="px-5 py-3.5 font-medium">{REPORT_LABELS[s.reportType] ?? s.reportType}</td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {FREQUENCY_LABELS[s.frequency] ?? s.frequency}
                  {s.frequency === "WEEKLY" && s.dayOfWeek !== null && ` on ${DAYS_OF_WEEK[s.dayOfWeek]}`}
                  {s.frequency !== "WEEKLY" && s.dayOfMonth !== null && ` on day ${s.dayOfMonth}`}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">{s.recipients.join(", ")}</td>
                <td className="px-5 py-3.5">
                  {s.enabled ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Paused</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">
                  {s.lastSentAt ? new Date(s.lastSentAt).toLocaleDateString() : "\u2014"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(s.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete scheduled report"
        description="This will stop all future deliveries of this report."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </>
  );
}
