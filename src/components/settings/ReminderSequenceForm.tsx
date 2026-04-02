"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type StepInput = {
  daysRelativeToDue: number;
  subject: string;
  body: string;
  sort: number;
};

const DEFAULT_STEPS: StepInput[] = [
  { daysRelativeToDue: -3, subject: "Upcoming: Invoice #{{ invoiceNumber }} due in 3 days", body: "<p>Hi {{ clientName }},</p><p>This is a friendly reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is due on {{ dueDate }}.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 0 },
  { daysRelativeToDue: 0, subject: "Due today: Invoice #{{ invoiceNumber }}", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is due today.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 1 },
  { daysRelativeToDue: 7, subject: "Overdue: Invoice #{{ invoiceNumber }} (7 days past due)", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 7 days overdue.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>", sort: 2 },
  { daysRelativeToDue: 14, subject: "Second notice: Invoice #{{ invoiceNumber }} (14 days overdue)", body: "<p>Hi {{ clientName }},</p><p>This is a second reminder that Invoice #{{ invoiceNumber }} for {{ amountDue }} is 14 days past due.</p><p><a href=\"{{ paymentLink }}\">View & Pay Now</a></p><p>{{ orgName }}</p>", sort: 3 },
  { daysRelativeToDue: 30, subject: "Final notice: Invoice #{{ invoiceNumber }} (30 days overdue)", body: "<p>Hi {{ clientName }},</p><p>Invoice #{{ invoiceNumber }} for {{ amountDue }} is now 30 days overdue. Please arrange payment immediately.</p><p><a href=\"{{ paymentLink }}\">View & Pay Now</a></p><p>{{ orgName }}</p>", sort: 4 },
];

type Props = {
  editId: string | null;
  onClose: () => void;
};

export function ReminderSequenceForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: existing } = trpc.reminderSequences.getById.useQuery(
    { id: editId! },
    { enabled: !!editId }
  );

  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<StepInput[]>(DEFAULT_STEPS);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIsDefault(existing.isDefault);
      setEnabled(existing.enabled);
      setSteps(
        existing.steps.map((s) => ({
          daysRelativeToDue: s.daysRelativeToDue,
          subject: s.subject,
          body: s.body,
          sort: s.sort,
        }))
      );
    }
  }, [existing]);

  const createMutation = trpc.reminderSequences.create.useMutation({
    onSuccess: () => {
      toast.success("Sequence created");
      utils.reminderSequences.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.reminderSequences.update.useMutation({
    onSuccess: () => {
      toast.success("Sequence updated");
      utils.reminderSequences.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  function addStep() {
    const maxDay = steps.length > 0 ? Math.max(...steps.map((s) => s.daysRelativeToDue)) : 0;
    setSteps([
      ...steps,
      {
        daysRelativeToDue: maxDay + 7,
        subject: "Reminder: Invoice #{{ invoiceNumber }}",
        body: "<p>Hi {{ clientName }},</p><p>This is a reminder about Invoice #{{ invoiceNumber }} for {{ amountDue }}.</p><p><a href=\"{{ paymentLink }}\">View & Pay</a></p><p>{{ orgName }}</p>",
        sort: steps.length,
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort: i })));
  }

  function updateStep(index: number, field: keyof StepInput, value: string | number) {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (steps.length === 0) {
      toast.error("At least one step is required");
      return;
    }

    const data = { name: name.trim(), isDefault, enabled, steps };
    if (editId) {
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/50 bg-card p-5 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Sequence Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Default Reminder Sequence"
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-border" />
            Default sequence
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-border" />
            Enabled
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Steps</h3>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addStep}>
            <Plus className="w-3 h-3 mr-1" /> Add Step
          </Button>
        </div>
        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Step {i + 1}: {step.daysRelativeToDue < 0 ? `${Math.abs(step.daysRelativeToDue)} days before due` : step.daysRelativeToDue === 0 ? "On due date" : `${step.daysRelativeToDue} days after due`}
              </span>
              {steps.length > 1 && (
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeStep(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Days</label>
                <input
                  type="number"
                  value={step.daysRelativeToDue}
                  onChange={(e) => updateStep(i, "daysRelativeToDue", parseInt(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Subject</label>
                <input
                  type="text"
                  value={step.subject}
                  onChange={(e) => updateStep(i, "subject", e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Body (HTML)</label>
              <textarea
                value={step.body}
                onChange={(e) => updateStep(i, "body", e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isLoading}>
          {editId ? "Update Sequence" : "Create Sequence"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
