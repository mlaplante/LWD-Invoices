"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

export type PartialPaymentEntry = {
  sortOrder: number;
  amount: number;
  isPercentage: boolean;
  dueDate: string;
  notes: string;
  isPaid?: boolean;
  paidAt?: Date | null;
  id?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceTotal: number;
  invoiceDueDate?: string | null;
  currencySymbol: string;
  currencySymbolPosition: string;
  existingSchedule?: PartialPaymentEntry[];
  onSave: (schedule: PartialPaymentEntry[]) => void;
  saving?: boolean;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentScheduleDialog({
  open,
  onOpenChange,
  invoiceTotal,
  invoiceDueDate,
  currencySymbol,
  currencySymbolPosition,
  existingSchedule,
  onSave,
  saving,
}: Props) {
  const [entries, setEntries] = useState<PartialPaymentEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      if (existingSchedule && existingSchedule.length > 0) {
        setEntries(existingSchedule.map((e) => ({ ...e })));
      } else {
        setEntries([]);
      }
      setExpandedNotes(new Set());
    }
  }, [open, existingSchedule]);

  const fmt = (n: number) =>
    currencySymbolPosition === "before"
      ? `${currencySymbol}${n.toFixed(2)}`
      : `${n.toFixed(2)}${currencySymbol}`;

  const baseDate = invoiceDueDate || today();

  function applyPreset(count: number) {
    const paidEntries = entries.filter((e) => e.isPaid);
    const perPayment = Math.floor((10000 / count)) / 100;
    const remainder = 100 - perPayment * (count - 1);

    const newEntries: PartialPaymentEntry[] = Array.from({ length: count }, (_, i) => ({
      sortOrder: paidEntries.length + i,
      amount: i === count - 1 ? parseFloat(remainder.toFixed(2)) : perPayment,
      isPercentage: true,
      dueDate: addDays(baseDate, 30 * (i + 1)),
      notes: "",
    }));

    setEntries([...paidEntries, ...newEntries]);
  }

  function addEntry() {
    const lastDate = entries.length > 0
      ? entries[entries.length - 1].dueDate
      : baseDate;
    setEntries((prev) => [
      ...prev,
      {
        sortOrder: prev.length,
        amount: 0,
        isPercentage: false,
        dueDate: addDays(lastDate, 30),
        notes: "",
      },
    ]);
  }

  function updateEntry(index: number, updates: Partial<PartialPaymentEntry>) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...updates } : e))
    );
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleNotes(index: number) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const paidEntries = entries.filter((e) => e.isPaid);
  const editableEntries = entries.filter((e) => !e.isPaid);

  let scheduledAmount = 0;
  let scheduledPercent = 0;

  for (const e of entries) {
    if (e.isPercentage) {
      scheduledPercent += e.amount;
      scheduledAmount += (e.amount / 100) * invoiceTotal;
    } else {
      scheduledAmount += e.amount;
    }
  }

  const allPercentage = entries.every((e) => e.isPaid || e.isPercentage);
  const coverageMismatch = allPercentage
    ? Math.abs(scheduledPercent - 100) > 0.01
    : Math.abs(scheduledAmount - invoiceTotal) > 0.01;

  function handleSave() {
    const schedule = entries
      .filter((e) => !e.isPaid)
      .map((e, i) => ({ ...e, sortOrder: (paidEntries.length) + i }));
    onSave(schedule);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Schedule</DialogTitle>
          <DialogDescription>
            Split this invoice ({fmt(invoiceTotal)}) into multiple installments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Quick split:</span>
          {[2, 3, 4].map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => applyPreset(n)}
            >
              {n} payments
            </Button>
          ))}
        </div>

        {paidEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Paid (locked)
            </p>
            {paidEntries.map((e, i) => (
              <div
                key={e.id ?? `paid-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              >
                <span className="w-6 text-center font-medium">{i + 1}</span>
                <span className="flex-1">
                  {e.isPercentage ? `${e.amount}%` : fmt(e.amount)}
                </span>
                <span>{e.dueDate}</span>
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-600">
                  Paid
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {editableEntries.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {paidEntries.length > 0 ? "Remaining" : "Installments"}
            </p>
          )}
          {editableEntries.map((entry, relIdx) => {
            const absIdx = paidEntries.length + relIdx;
            return (
              <div key={absIdx} className="space-y-2 rounded-lg border border-border/50 p-3 sm:border-0 sm:p-0 sm:rounded-none">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <span className="w-6 text-center text-sm font-medium text-muted-foreground shrink-0">
                    {absIdx + 1}
                  </span>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={entry.amount || ""}
                      onChange={(e) =>
                        updateEntry(absIdx, { amount: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full sm:w-28 h-10 sm:h-8 text-sm"
                      placeholder="Amount"
                    />

                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      <button
                        type="button"
                        className={`px-2.5 py-2 sm:py-1 text-xs transition-colors ${
                          !entry.isPercentage
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        onClick={() => updateEntry(absIdx, { isPercentage: false })}
                      >
                        {currencySymbol}
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-2 sm:py-1 text-xs transition-colors ${
                          entry.isPercentage
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        onClick={() => updateEntry(absIdx, { isPercentage: true })}
                      >
                        %
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      type="date"
                      value={entry.dueDate}
                      onChange={(e) => updateEntry(absIdx, { dueDate: e.target.value })}
                      className="flex-1 sm:w-36 h-10 sm:h-8 text-sm"
                    />

                    <button
                      type="button"
                      className="p-2 sm:p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      onClick={() => toggleNotes(absIdx)}
                      title="Notes"
                    >
                      {expandedNotes.has(absIdx) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      className="p-2 sm:p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      onClick={() => removeEntry(absIdx)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedNotes.has(absIdx) && (
                  <div className="pl-0 sm:pl-8">
                    <Input
                      value={entry.notes}
                      onChange={(e) => updateEntry(absIdx, { notes: e.target.value })}
                      placeholder="Notes (optional)"
                      className="h-10 sm:h-7 text-sm sm:text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addEntry}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Installment
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span>
                Scheduled:{" "}
                <span className="font-semibold">
                  {allPercentage
                    ? `${scheduledPercent.toFixed(1)}% / 100%`
                    : `${fmt(scheduledAmount)} / ${fmt(invoiceTotal)}`}
                </span>
              </span>
              {coverageMismatch && entries.some((e) => !e.isPaid) && (
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  Doesn&apos;t cover full total
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {entries.some((e) => !e.isPaid) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => setEntries(paidEntries)}
            >
              Clear Schedule
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving\u2026" : "Save Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
