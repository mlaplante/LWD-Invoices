"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const REPORT_TYPES = [
  { value: "PROFIT_LOSS", label: "Profit & Loss" },
  { value: "AGING", label: "Invoice Aging" },
  { value: "UNPAID", label: "Unpaid Invoices" },
  { value: "EXPENSES", label: "Expenses" },
  { value: "TAX_LIABILITY", label: "Tax Liability" },
] as const;

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
] as const;

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = {
  editId: string | null;
  onClose: () => void;
};

export function ScheduledReportForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: schedules } = trpc.scheduledReports.list.useQuery();
  const existing = editId ? schedules?.find((s) => s.id === editId) : null;

  const [reportType, setReportType] = useState(existing?.reportType ?? "PROFIT_LOSS");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "MONTHLY");
  const [dayOfWeek, setDayOfWeek] = useState<number>(existing?.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(existing?.dayOfMonth ?? 1);
  const [recipients, setRecipients] = useState(existing?.recipients?.join(", ") ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  useEffect(() => {
    if (existing) {
      setReportType(existing.reportType);
      setFrequency(existing.frequency);
      setDayOfWeek(existing.dayOfWeek ?? 1);
      setDayOfMonth(existing.dayOfMonth ?? 1);
      setRecipients(existing.recipients.join(", "));
      setEnabled(existing.enabled);
    }
  }, [existing]);

  const createMutation = trpc.scheduledReports.create.useMutation({
    onSuccess: () => {
      toast.success("Schedule created");
      utils.scheduledReports.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.scheduledReports.update.useMutation({
    onSuccess: () => {
      toast.success("Schedule updated");
      utils.scheduledReports.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedRecipients = recipients.split(",").map((r) => r.trim()).filter(Boolean);
    if (parsedRecipients.length === 0) {
      toast.error("At least one recipient email is required");
      return;
    }

    const data = {
      reportType: reportType as "PROFIT_LOSS" | "AGING" | "UNPAID" | "EXPENSES" | "TAX_LIABILITY",
      frequency: frequency as "WEEKLY" | "MONTHLY" | "QUARTERLY",
      dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : null,
      dayOfMonth: frequency !== "WEEKLY" ? dayOfMonth : null,
      recipients: parsedRecipients,
      enabled,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div>
          <label className="text-sm font-medium">Day of Week</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {DAYS_OF_WEEK.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
      )}

      {(frequency === "MONTHLY" || frequency === "QUARTERLY") && (
        <div>
          <label className="text-sm font-medium">Day of Month (1-28)</label>
          <input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Recipients (comma-separated emails)</label>
        <input
          type="text"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="owner@example.com, accountant@example.com"
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="enabled" className="text-sm">Enabled</label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isLoading}>
          {editId ? "Update" : "Create"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
