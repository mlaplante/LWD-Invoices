"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pencil, Trash2, Plus, Pause, Play, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export function RecurringExpenseList() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.recurringExpenses.list.useQuery();

  const deleteMutation = trpc.recurringExpenses.delete.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense deleted");
      setDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteId(null);
    },
  });

  const toggleMutation = trpc.recurringExpenses.toggleActive.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  function formatFrequency(freq: string, interval: number) {
    if (interval === 1) return FREQUENCY_LABELS[freq] ?? freq;
    return `Every ${interval} ${freq.toLowerCase().replace(/ly$/, "")}s`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
              <Link href="/expenses"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Recurring Expenses</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-9">
            Expense templates that auto-generate on a schedule.
          </p>
        </div>
        <Button asChild>
          <Link href="/expenses/recurring/new">
            <Plus className="w-4 h-4 mr-1.5" />
            New Recurring Expense
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            All Recurring Expenses
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-sm text-muted-foreground">No recurring expenses set up yet.</p>
            <Button asChild size="sm">
              <Link href="/expenses/recurring/new">
                <Plus className="w-4 h-4 mr-1.5" />
                Create your first recurring expense
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frequency</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Next Run</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Run</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generated</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item) => {
                  const amount = item.qty * Number(item.rate);
                  return (
                    <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-6 py-3.5 font-medium">{item.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {formatFrequency(item.frequency, item.interval)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {item.isActive ? new Date(item.nextRunAt).toLocaleDateString() : "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">
                        {item.lastRunDate ? new Date(item.lastRunDate).toLocaleDateString() : "\u2014"}
                      </td>
                      <td className="px-6 py-3.5 text-center text-muted-foreground tabular-nums">
                        {item.totalGenerated}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {item.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Paused</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleMutation.mutate({ id: item.id })}
                            title={item.isActive ? "Pause" : "Resume"}
                          >
                            {item.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </Button>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/expenses/recurring/${item.id}/edit`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete recurring expense"
        description="Generated expenses will remain. This only removes the recurring template."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}
