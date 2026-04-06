"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

type Props = { onEdit: (id: string) => void };

export function ReminderSequenceList({ onEdit }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: sequences = [] } = trpc.reminderSequences.list.useQuery();

  const deleteMutation = trpc.reminderSequences.delete.useMutation({
    onSuccess: () => {
      toast.success("Sequence deleted");
      utils.reminderSequences.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => { toast.error(err.message); setDeleteId(null); },
  });

  if (sequences.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No reminder sequences yet. Create one to automate payment reminders.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steps</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoices</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sequences.map((seq) => (
              <tr key={seq.id} className="hover:bg-accent/20 transition-colors">
                <td className="px-5 py-3.5 font-medium">
                  {seq.name}
                  {seq.isDefault && (
                    <span className="ml-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Default
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{seq.steps.length}</td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">
                  {seq.steps.map((s) => {
                    if (s.daysRelativeToDue < 0) return `${Math.abs(s.daysRelativeToDue)}d before`;
                    if (s.daysRelativeToDue === 0) return "due date";
                    return `+${s.daysRelativeToDue}d`;
                  }).join(", ")}
                </td>
                <td className="px-5 py-3.5">
                  {seq.enabled ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Paused</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{seq._count.invoices}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(seq.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(seq.id)}>
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
        title="Delete reminder sequence"
        description="Invoices using this sequence will fall back to the default. Existing reminder logs are preserved."
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        loading={deleteMutation.isPending}
        destructive
      />
    </>
  );
}
