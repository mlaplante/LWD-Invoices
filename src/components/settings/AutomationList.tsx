"use client";

import { trpc } from "@/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Pencil,
  Trash2,
  CreditCard,
  Send,
  Eye,
  AlertTriangle,
  Clock,
} from "lucide-react";

const TRIGGER_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  PAYMENT_RECEIVED: {
    label: "Payment Received",
    icon: <CreditCard className="w-3.5 h-3.5" />,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  INVOICE_SENT: {
    label: "Invoice Sent",
    icon: <Send className="w-3.5 h-3.5" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  INVOICE_VIEWED: {
    label: "Invoice Viewed",
    icon: <Eye className="w-3.5 h-3.5" />,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  INVOICE_OVERDUE: {
    label: "Invoice Overdue",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-red-600",
    bg: "bg-red-50",
  },
};

type Props = {
  onEdit: (id: string) => void;
};

export function AutomationList({ onEdit }: Props) {
  const utils = trpc.useUtils();
  const { data: automations, isLoading } =
    trpc.emailAutomations.list.useQuery();
  const updateMutation = trpc.emailAutomations.update.useMutation({
    onSuccess: () => utils.emailAutomations.list.invalidate(),
  });
  const deleteMutation = trpc.emailAutomations.delete.useMutation({
    onSuccess: () => {
      utils.emailAutomations.list.invalidate();
      toast.success("Automation deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-border/50 bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!automations?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Mail className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          No automations yet
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first email automation to send messages automatically when
          events occur.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {automations.map((a) => {
          const cfg = TRIGGER_CONFIG[a.trigger] ?? {
            label: a.trigger,
            icon: <Mail className="w-3.5 h-3.5" />,
            color: "text-muted-foreground",
            bg: "bg-muted",
          };

          return (
            <div
              key={a.id}
              className="rounded-xl border border-border/50 bg-card p-4 flex items-start gap-4"
            >
              {/* Trigger badge */}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}
              >
                {cfg.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}
                  >
                    {cfg.label}
                  </span>
                  {a.delayDays > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {a.delayDays}d delay
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground truncate">
                  {a.templateSubject}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {a.templateBody.slice(0, 120)}
                  {a.templateBody.length > 120 ? "..." : ""}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={a.enabled}
                  onCheckedChange={(checked) => {
                    updateMutation.mutate(
                      { id: a.id, enabled: checked },
                      {
                        onSuccess: () =>
                          toast.success(
                            checked
                              ? "Automation enabled"
                              : "Automation disabled"
                          ),
                        onError: (err) => toast.error(err.message),
                      }
                    );
                  }}
                  size="sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(a.id)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(a.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete automation"
        description="This will permanently delete this email automation. This action cannot be undone."
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget });
            setDeleteTarget(null);
          }
        }}
        loading={deleteMutation.isPending}
        destructive
      />
    </>
  );
}
