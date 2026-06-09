"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";

type Row = { name: string; qty: string; rate: string };

type Props = {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
};

function emptyRow(): Row {
  return { name: "", qty: "1", rate: "" };
}

export function ChangeOrderForm({ projectId, onDone, onCancel }: Props) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [notes, setNotes] = useState("");

  const mutation = trpc.invoices.createChangeOrder.useMutation({
    onSuccess: () => onDone(),
  });

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const validRows = rows.filter(
    (r) => r.name.trim().length > 0 && r.qty !== "" && r.rate !== ""
  );

  const canSubmit = validRows.length > 0 && !mutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      projectId,
      notes: notes.trim() || undefined,
      lines: validRows.map((r, i) => ({
        sort: i,
        name: r.name.trim(),
        qty: Number(r.qty),
        rate: Number(r.rate),
        taxIds: [],
      })),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/50 bg-card p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold">New Change Order</h3>

      {/* Line items */}
      <div className="space-y-2">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[2fr_80px_120px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2fr_80px_120px_32px] gap-2 items-start">
            <Input
              placeholder="Item name"
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              type="number"
              min={0}
              step="any"
              placeholder="1"
              value={row.qty}
              onChange={(e) => updateRow(i, { qty: e.target.value })}
              className="h-8 text-right text-sm"
            />
            <Input
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              value={row.rate}
              onChange={(e) => updateRow(i, { rate: e.target.value })}
              className="h-8 text-right text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-1.5 text-muted-foreground hover:text-destructive disabled:opacity-40"
              disabled={rows.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={addRow}
        >
          <Plus className="w-3.5 h-3.5" />
          Add row
        </Button>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Notes (optional)
        </label>
        <Textarea
          placeholder="Any notes for this change order…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[72px] text-sm resize-y"
          rows={3}
        />
      </div>

      {/* Mutation error */}
      {mutation.error && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {mutation.isPending ? "Creating…" : "Create change order"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
