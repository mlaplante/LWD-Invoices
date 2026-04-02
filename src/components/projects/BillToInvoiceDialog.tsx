"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TimeEntry = {
  id: string;
  date: Date;
  minutes: { toNumber(): number };
  note: string | null;
  invoiceLineId: string | null;
  task: { name: string } | null;
};

type Expense = {
  id: string;
  name: string;
  qty: number;
  rate: { toNumber(): number };
  invoiceLineId: string | null;
};

type Props = {
  projectId: string;
  clientId: string;
  mode: "time" | "expenses";
  timeEntries?: TimeEntry[];
  expenses?: Expense[];
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function BillToInvoiceDialog({
  projectId,
  clientId,
  mode,
  timeEntries = [],
  expenses = [],
  onSuccess,
  onCancel,
}: Props) {
  const utils = trpc.useUtils();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data } = trpc.invoices.list.useQuery({
    clientId,
    status: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"],
  });
  const invoices = data?.items ?? [];

  const billTimeMutation = trpc.timeEntries.billToInvoice.useMutation({
    onSuccess: () => {
      utils.timeEntries.list.invalidate({ projectId });
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  const billExpensesMutation = trpc.expenses.billToInvoice.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate({ projectId });
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedInvoiceId) {
      setError("Select an invoice.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("Select at least one item.");
      return;
    }

    if (mode === "time") {
      billTimeMutation.mutate({
        invoiceId: selectedInvoiceId,
        entryIds: Array.from(selectedIds),
      });
    } else {
      billExpensesMutation.mutate({
        invoiceId: selectedInvoiceId,
        expenseIds: Array.from(selectedIds),
      });
    }
  }

  const unbilledTime = timeEntries.filter((e) => !e.invoiceLineId);
  const unbilledExpenses = expenses.filter((e) => !e.invoiceLineId);
  const items = mode === "time" ? unbilledTime : unbilledExpenses;
  const isPending = billTimeMutation.isPending || billExpensesMutation.isPending;

  // Compute total
  let totalHours = 0;
  let totalAmount = 0;
  if (mode === "time") {
    unbilledTime
      .filter((e) => selectedIds.has(e.id))
      .forEach((e) => {
        totalHours += e.minutes.toNumber() / 60;
      });
  } else {
    unbilledExpenses
      .filter((e) => selectedIds.has(e.id))
      .forEach((e) => {
        totalAmount += e.qty * e.rate.toNumber();
      });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Invoice</label>
        <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select invoice" />
          </SelectTrigger>
          <SelectContent>
            {invoices.map((inv) => (
              <SelectItem key={inv.id} value={inv.id}>
                #{inv.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {invoices.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            No open invoices for this client.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unbilled {mode === "time" ? "time entries" : "expenses"}.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium">
              {mode === "time" ? "Time Entries" : "Expenses"}
            </label>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => {
                if (selectedIds.size === items.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(items.map((i) => i.id)));
                }
              }}
            >
              {selectedIds.size === items.length ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 rounded border p-2">
            {mode === "time"
              ? unbilledTime.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleId(entry.id)}
                    />
                    <span className="text-sm flex-1">
                      {entry.task?.name ?? "No task"} —{" "}
                      {(entry.minutes.toNumber() / 60).toFixed(2)}h
                      {entry.note && (
                        <span className="text-muted-foreground"> ({entry.note})</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </label>
                ))
              : unbilledExpenses.map((expense) => (
                  <label
                    key={expense.id}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(expense.id)}
                      onChange={() => toggleId(expense.id)}
                    />
                    <span className="text-sm flex-1">{expense.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {expense.qty} × {expense.rate.toNumber().toFixed(2)}
                    </span>
                  </label>
                ))}
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="rounded bg-muted/50 px-3 py-2 text-sm">
          {mode === "time" ? (
            <span>
              {selectedIds.size} entries — <strong>{totalHours.toFixed(2)}h</strong> total
            </span>
          ) : (
            <span>
              {selectedIds.size} expenses — <strong>{totalAmount.toFixed(2)}</strong> total
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || selectedIds.size === 0 || !selectedInvoiceId}>
          {isPending ? "Billing…" : "Bill to Invoice"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
