"use client";

import { trpc } from "@/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import { Workflow, Pencil, Trash2, CreditCard, Send, Eye, AlertTriangle } from "lucide-react";

const TRIGGER_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  PAYMENT_RECEIVED: { label: "Payment Received", icon: <CreditCard className="w-3.5 h-3.5" />, color: "text-emerald-600", bg: "bg-emerald-50" },
  INVOICE_SENT: { label: "Invoice Sent", icon: <Send className="w-3.5 h-3.5" />, color: "text-blue-600", bg: "bg-blue-50" },
  INVOICE_VIEWED: { label: "Invoice Viewed", icon: <Eye className="w-3.5 h-3.5" />, color: "text-amber-600", bg: "bg-amber-50" },
  INVOICE_OVERDUE: { label: "Invoice Overdue", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-red-600", bg: "bg-red-50" },
};

const ACTION_LABELS: Record<string, string> = {
  SEND_EMAIL: "Send email",
  NOTIFY_ADMINS: "Notify admins",
};

type Props = { onEdit: (id: string) => void };

export function AutomationRuleList({ onEdit }: Props) {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.automationRules.list.useQuery();
  const setEnabled = trpc.automationRules.setEnabled.useMutation({
    onSuccess: () => utils.automationRules.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.automationRules.delete.useMutation({
    onSuccess: () => {
      utils.automationRules.list.invalidate();
      toast.success("Rule deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading rules…</div>;
  }

  if (!rules || rules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
        <Workflow className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">No automation rules yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create a rule to automatically act on invoices when something happens.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rules.map((rule) => {
        const t = TRIGGER_CONFIG[rule.trigger] ?? { label: rule.trigger, icon: null, color: "", bg: "bg-muted" };
        return (
          <div key={rule.id} className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${t.bg} ${t.color}`}>
                    {t.icon}
                    {t.label}
                  </span>
                  <span className="font-medium truncate">{rule.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {rule.conditions.length === 0
                    ? "Runs on every matching event"
                    : `${rule.conditions.length} condition${rule.conditions.length > 1 ? "s" : ""} (${rule.conditionLogic})`}
                  {" · "}
                  {rule.actions.map((a) => ACTION_LABELS[a.type] ?? a.type).join(", ")}
                  {" · "}
                  {rule._count.runs} run{rule._count.runs === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => setEnabled.mutate({ id: rule.id, enabled })}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(rule.id)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(rule.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete automation rule?"
        description="This permanently removes the rule. Past runs are kept for audit."
        destructive
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate({ id: deleteId });
          setDeleteId(null);
        }}
      />
    </div>
  );
}
