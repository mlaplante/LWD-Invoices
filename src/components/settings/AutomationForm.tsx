"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_VARIABLES } from "@/server/services/automation-template";
import { toast } from "sonner";
import { X } from "lucide-react";

type Props = {
  editId?: string | null;
  onClose: () => void;
};

const TRIGGER_OPTIONS = [
  { value: "PAYMENT_RECEIVED", label: "Payment Received" },
  { value: "INVOICE_SENT", label: "Invoice Sent" },
  { value: "INVOICE_VIEWED", label: "Invoice Viewed" },
  { value: "INVOICE_OVERDUE", label: "Invoice Overdue" },
] as const;

export function AutomationForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [trigger, setTrigger] = useState<string>("PAYMENT_RECEIVED");
  const [delayDays, setDelayDays] = useState(0);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  // Load existing data when editing
  const { data: automations } = trpc.emailAutomations.list.useQuery();
  const existing = editId
    ? automations?.find((a) => a.id === editId)
    : undefined;

  useEffect(() => {
    if (existing) {
      setTrigger(existing.trigger);
      setDelayDays(existing.delayDays);
      setTemplateSubject(existing.templateSubject);
      setTemplateBody(existing.templateBody);
    }
  }, [existing]);

  const createMutation = trpc.emailAutomations.create.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.emailAutomations.update.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      trigger: trigger as "PAYMENT_RECEIVED" | "INVOICE_SENT" | "INVOICE_VIEWED" | "INVOICE_OVERDUE",
      delayDays,
      templateSubject,
      templateBody,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate({ ...payload, enabled: true });
    }
  }

  function insertVariable(varName: string) {
    const textarea = bodyRef.current;
    if (!textarea) {
      setTemplateBody((prev) => prev + `{{ ${varName} }}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = `{{ ${varName} }}`;
    const newBody =
      templateBody.slice(0, start) + text + templateBody.slice(end);
    setTemplateBody(newBody);
    // Restore cursor after insert
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">
          {editId ? "Edit Automation" : "New Automation"}
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Trigger</label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Delay (days)</label>
            <Input
              type="number"
              min={0}
              max={90}
              value={delayDays}
              onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              0 = send immediately when the event occurs.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Subject</label>
          <Input
            value={templateSubject}
            onChange={(e) => setTemplateSubject(e.target.value)}
            placeholder="e.g. Thank you for your payment, {{ clientName }}"
            required
            maxLength={200}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Body</label>
          <Textarea
            ref={bodyRef}
            value={templateBody}
            onChange={(e) => setTemplateBody(e.target.value)}
            placeholder="Write your email body here. Use variables below to personalize."
            required
            rows={6}
            maxLength={5000}
            className="mt-1 font-mono text-sm"
          />
        </div>

        {/* Variable reference panel */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Available Variables (click to insert)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                {"{{ "}
                {v}
                {" }}"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving..."
              : editId
                ? "Update Automation"
                : "Create Automation"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
