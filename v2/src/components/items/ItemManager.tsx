"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Item = {
  id: string;
  name: string;
  description: string | null;
  rate: { toNumber(): number } | number | null;
  unit: string | null;
};

type Props = { initialItems: Item[] };

const EMPTY = { name: "", description: "", rate: "", unit: "" };

export function ItemManager({ initialItems }: Props) {
  const utils = trpc.useUtils();
  const { data: items = initialItems } = trpc.items.list.useQuery(undefined);

  const createMutation = trpc.items.create.useMutation({
    onSuccess: () => { void utils.items.list.invalidate(); setAdding(false); setForm(EMPTY); },
  });
  const updateMutation = trpc.items.update.useMutation({
    onSuccess: () => { void utils.items.list.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.items.delete.useMutation({
    onSuccess: () => void utils.items.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState(EMPTY);

  function rateNum(r: Item["rate"]): string {
    if (r == null) return "";
    return typeof r === "object" ? r.toNumber().toString() : r.toString();
  }

  function startEdit(item: Item) {
    setEditing(item.id);
    setEditForm({
      name: item.name,
      description: item.description ?? "",
      rate: rateNum(item.rate),
      unit: item.unit ?? "",
    });
  }

  function buildPayload(f: typeof EMPTY) {
    return {
      name: f.name,
      description: f.description || undefined,
      rate: f.rate ? parseFloat(f.rate) : undefined,
      unit: f.unit || undefined,
    };
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
          <p className="font-medium">No items yet</p>
          <p className="text-sm mt-1">Create reusable items to speed up invoice creation.</p>
          <Button className="mt-4" onClick={() => setAdding(true)}>Add Item</Button>
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border/50">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-4 py-3 text-left font-medium">Unit</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) =>
                    editing === item.id ? (
                      <tr key={item.id}>
                        <td className="px-4 py-2">
                          <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-8 w-40" />
                        </td>
                        <td className="px-4 py-2">
                          <Input value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} className="h-8 w-48" />
                        </td>
                        <td className="px-4 py-2">
                          <Input type="number" step="0.01" value={editForm.rate} onChange={(e) => setEditForm((p) => ({ ...p, rate: e.target.value }))} className="h-8 w-24 text-right" />
                        </td>
                        <td className="px-4 py-2">
                          <Input value={editForm.unit} onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))} placeholder="hr, kg…" className="h-8 w-20" />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: item.id, ...buildPayload(editForm) })} disabled={updateMutation.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.description ?? "—"}</td>
                        <td className="px-4 py-3 text-right">{item.rate != null ? rateNum(item.rate) : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.unit ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => startEdit(item)} className="text-xs text-blue-600 hover:underline">Edit</button>
                            <button onClick={() => deleteMutation.mutate({ id: item.id })} className="text-xs text-destructive hover:underline">Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {adding ? (
            <div className="rounded-2xl border border-border/50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Name *</label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Web Design" className="mt-1 h-8" />
                </div>
                <div>
                  <label className="text-xs font-medium">Unit</label>
                  <Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} placeholder="hr, page, item…" className="mt-1 h-8" />
                </div>
                <div>
                  <label className="text-xs font-medium">Default Rate</label>
                  <Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))} placeholder="0.00" className="mt-1 h-8" />
                </div>
                <div>
                  <label className="text-xs font-medium">Description</label>
                  <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="mt-1 h-8" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createMutation.mutate(buildPayload(form))} disabled={createMutation.isPending || !form.name}>
                  {createMutation.isPending ? "Adding…" : "Add Item"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAdding(false); setForm(EMPTY); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Add Item</Button>
          )}
        </>
      )}
    </div>
  );
}
