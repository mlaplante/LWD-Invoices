"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";

type Props = {
  invoiceId: string;
  currentSequenceId: string | null;
};

export function ReminderOverrideSelect({ invoiceId, currentSequenceId }: Props) {
  const utils = trpc.useUtils();
  const { data: sequences = [] } = trpc.reminderSequences.list.useQuery();

  const updateInvoice = trpc.invoices.update.useMutation({
    onSuccess: () => {
      toast.success("Reminder sequence updated");
      utils.invoices.get.invalidate({ id: invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Reminder Sequence
      </label>
      <select
        value={currentSequenceId ?? ""}
        onChange={(e) => {
          const val = e.target.value || null;
          updateInvoice.mutate({
            id: invoiceId,
            reminderSequenceId: val,
          } as any);
        }}
        disabled={updateInvoice.isPending}
        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="">Use default</option>
        {sequences.map((seq) => (
          <option key={seq.id} value={seq.id}>
            {seq.name} {seq.isDefault ? "(default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
