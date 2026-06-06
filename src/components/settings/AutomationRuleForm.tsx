"use client";

import { useEffect, useState } from "react";
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
import { operatorsForField } from "@/server/services/automation-engine";
import { AVAILABLE_VARIABLES } from "@/server/services/automation-template";
import { toast } from "sonner";
import { X, Plus, Trash2 } from "lucide-react";

type Props = { editId?: string | null; onClose: () => void };

type Trigger = "PAYMENT_RECEIVED" | "INVOICE_SENT" | "INVOICE_VIEWED" | "INVOICE_OVERDUE";
type Field = "TOTAL" | "AMOUNT_DUE" | "DAYS_OVERDUE" | "STATUS" | "CLIENT_NAME" | "CURRENCY_CODE";
type Operator = "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "CONTAINS" | "NOT_CONTAINS";
type ActionType = "SEND_EMAIL" | "NOTIFY_ADMINS";

interface ConditionRow {
  field: Field;
  operator: Operator;
  value: string;
}
interface ActionRow {
  type: ActionType;
  subject: string;
  body: string;
  title: string;
}

const TRIGGER_OPTIONS: { value: Trigger; label: string }[] = [
  { value: "PAYMENT_RECEIVED", label: "Payment received" },
  { value: "INVOICE_SENT", label: "Invoice sent" },
  { value: "INVOICE_VIEWED", label: "Invoice viewed" },
  { value: "INVOICE_OVERDUE", label: "Invoice overdue" },
];

const FIELD_OPTIONS: { value: Field; label: string }[] = [
  { value: "TOTAL", label: "Invoice total" },
  { value: "AMOUNT_DUE", label: "Balance due" },
  { value: "DAYS_OVERDUE", label: "Days overdue" },
  { value: "STATUS", label: "Status" },
  { value: "CLIENT_NAME", label: "Client name" },
  { value: "CURRENCY_CODE", label: "Currency code" },
];

const OPERATOR_LABELS: Record<Operator, string> = {
  EQ: "is equal to",
  NEQ: "is not equal to",
  GT: "is greater than",
  GTE: "is at least",
  LT: "is less than",
  LTE: "is at most",
  CONTAINS: "contains",
  NOT_CONTAINS: "does not contain",
};

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: "SEND_EMAIL", label: "Send email to client" },
  { value: "NOTIFY_ADMINS", label: "Notify org admins (in-app)" },
];

function newAction(): ActionRow {
  return { type: "SEND_EMAIL", subject: "", body: "", title: "" };
}

export function AutomationRuleForm({ editId, onClose }: Props) {
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("INVOICE_OVERDUE");
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([newAction()]);

  const { data: rules } = trpc.automationRules.list.useQuery();
  const existing = editId ? rules?.find((r) => r.id === editId) : undefined;

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setTrigger(existing.trigger as Trigger);
    setConditionLogic(existing.conditionLogic as "AND" | "OR");
    setConditions(
      existing.conditions.map((c) => ({
        field: c.field as Field,
        operator: c.operator as Operator,
        value: c.value,
      })),
    );
    setActions(
      existing.actions.map((a) => {
        const cfg = (a.config ?? {}) as Record<string, string>;
        return {
          type: a.type as ActionType,
          subject: cfg.subject ?? "",
          body: cfg.body ?? "",
          title: cfg.title ?? "",
        };
      }),
    );
  }, [existing]);

  const createMutation = trpc.automationRules.create.useMutation({
    onSuccess: () => {
      utils.automationRules.list.invalidate();
      toast.success("Rule created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.automationRules.update.useMutation({
    onSuccess: () => {
      utils.automationRules.list.invalidate();
      toast.success("Rule updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });
  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Condition helpers ──────────────────────────────────────────────────────
  function addCondition() {
    setConditions((prev) => [...prev, { field: "AMOUNT_DUE", operator: "GT", value: "" }]);
  }
  function updateCondition(i: number, patch: Partial<ConditionRow>) {
    setConditions((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...patch };
        // When the field changes, snap the operator to one valid for the new field.
        if (patch.field) {
          const valid = operatorsForField(patch.field) as Operator[];
          if (!valid.includes(next.operator)) next.operator = valid[0];
        }
        return next;
      }),
    );
  }
  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── Action helpers ─────────────────────────────────────────────────────────
  function updateAction(i: number, patch: Partial<ActionRow>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      trigger,
      conditionLogic,
      enabled: existing?.enabled ?? true,
      conditions: conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value.trim() })),
      actions: actions.map((a) =>
        a.type === "SEND_EMAIL"
          ? { type: "SEND_EMAIL" as const, config: { subject: a.subject, body: a.body } }
          : { type: "NOTIFY_ADMINS" as const, config: { title: a.title, body: a.body } },
      ),
    };

    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{editId ? "Edit Rule" : "New Rule"}</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Rule name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase large overdue invoices"
              required
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">When (trigger)</label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as Trigger)}>
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
        </div>

        {/* Conditions */}
        <div className="rounded-lg border border-border/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Conditions</span>
              {conditions.length > 1 && (
                <Select value={conditionLogic} onValueChange={(v) => setConditionLogic(v as "AND" | "OR")}>
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">match ALL</SelectItem>
                    <SelectItem value="OR">match ANY</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCondition}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>

          {conditions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No conditions — the rule runs on every {TRIGGER_OPTIONS.find((t) => t.value === trigger)?.label.toLowerCase()} event.
            </p>
          ) : (
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={c.field} onValueChange={(v) => updateCondition(i, { field: v as Field })}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={c.operator} onValueChange={(v) => updateCondition(i, { operator: v as Operator })}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(operatorsForField(c.field) as Operator[]).map((op) => (
                        <SelectItem key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600" onClick={() => removeCondition(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="rounded-lg border border-border/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Then do</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setActions((p) => [...p, newAction()])}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add action
            </Button>
          </div>

          <div className="space-y-4">
            {actions.map((a, i) => (
              <div key={i} className="rounded-md border border-border/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Select value={a.type} onValueChange={(v) => updateAction(i, { type: v as ActionType })}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {actions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600 ml-auto" onClick={() => removeAction(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {a.type === "SEND_EMAIL" ? (
                  <>
                    <Input
                      value={a.subject}
                      onChange={(e) => updateAction(i, { subject: e.target.value })}
                      placeholder="Email subject — e.g. Invoice {{ invoiceNumber }} is overdue"
                      maxLength={200}
                      required
                    />
                    <Textarea
                      value={a.body}
                      onChange={(e) => updateAction(i, { body: e.target.value })}
                      placeholder="Email body. Use {{ variables }} to personalize."
                      rows={4}
                      maxLength={5000}
                      required
                      className="font-mono text-sm"
                    />
                  </>
                ) : (
                  <>
                    <Input
                      value={a.title}
                      onChange={(e) => updateAction(i, { title: e.target.value })}
                      placeholder="Notification title — e.g. {{ clientName }} invoice overdue"
                      maxLength={200}
                      required
                    />
                    <Textarea
                      value={a.body}
                      onChange={(e) => updateAction(i, { body: e.target.value })}
                      placeholder="Notification body"
                      rows={2}
                      maxLength={2000}
                      required
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Variables</p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map((v) => (
                <span key={v} className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-mono text-muted-foreground">
                  {`{{ ${v} }}`}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : editId ? "Update Rule" : "Create Rule"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
