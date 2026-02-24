"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tax = {
  id: string;
  name: string;
  rate: { toNumber(): number } | number;
  isCompound: boolean;
  isDefault: boolean;
};

type Props = { initialTaxes: Tax[] };

const EMPTY = { name: "", rate: 0, isCompound: false, isDefault: false };

export function TaxManager({ initialTaxes }: Props) {
  const utils = trpc.useUtils();
  const { data: taxes = initialTaxes } = trpc.taxes.list.useQuery(undefined);

  const createMutation = trpc.taxes.create.useMutation({
    onSuccess: () => { void utils.taxes.list.invalidate(); setAdding(false); setForm(EMPTY); },
  });
  const updateMutation = trpc.taxes.update.useMutation({
    onSuccess: () => { void utils.taxes.list.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.taxes.delete.useMutation({
    onSuccess: () => void utils.taxes.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState(EMPTY);

  function startEdit(t: Tax) {
    setEditing(t.id);
    setEditForm({
      name: t.name,
      rate: typeof t.rate === "object" ? t.rate.toNumber() : t.rate,
      isCompound: t.isCompound,
      isDefault: t.isDefault,
    });
  }

  const rateNum = (r: Tax["rate"]) => typeof r === "object" ? r.toNumber() : r;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Rate (%)</th>
              <th className="px-3 py-2 text-left font-medium">Compound</th>
              <th className="px-3 py-2 text-left font-medium">Default</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {taxes.map((t) =>
              editing === t.id ? (
                <tr key={t.id}>
                  <td className="px-3 py-2">
                    <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-7 w-32" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" step="0.01" value={editForm.rate} onChange={(e) => setEditForm((p) => ({ ...p, rate: parseFloat(e.target.value) || 0 }))} className="h-7 w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={editForm.isCompound} onChange={(e) => setEditForm((p) => ({ ...p, isCompound: e.target.checked }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={editForm.isDefault} onChange={(e) => setEditForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: t.id, ...editForm })} disabled={updateMutation.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-right">{rateNum(t.rate).toFixed(2)}%</td>
                  <td className="px-3 py-2">{t.isCompound && <span className="text-xs text-muted-foreground">Yes</span>}</td>
                  <td className="px-3 py-2">{t.isDefault && <span className="text-xs font-medium text-green-600">Default</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(t)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => deleteMutation.mutate({ id: t.id })} className="text-xs text-destructive hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {taxes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No taxes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="GST" className="mt-1 h-8" />
            </div>
            <div>
              <label className="text-xs font-medium">Rate (%)</label>
              <Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: parseFloat(e.target.value) || 0 }))} className="mt-1 h-8" />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.isCompound} onChange={(e) => setForm((p) => ({ ...p, isCompound: e.target.checked }))} />
                Compound
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                Default
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add Tax"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setForm(EMPTY); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Add Tax</Button>
      )}
    </div>
  );
}
