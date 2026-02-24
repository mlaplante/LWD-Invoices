"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  symbolPosition: string;
  exchangeRate: { toNumber(): number } | number;
  isDefault: boolean;
};

type Props = { initialCurrencies: Currency[] };

const EMPTY = {
  code: "",
  name: "",
  symbol: "",
  symbolPosition: "before" as "before" | "after",
  exchangeRate: 1,
  isDefault: false,
};

export function CurrencyManager({ initialCurrencies }: Props) {
  const utils = trpc.useUtils();
  const { data: currencies = initialCurrencies } = trpc.currencies.list.useQuery(undefined);

  const createMutation = trpc.currencies.create.useMutation({
    onSuccess: () => { void utils.currencies.list.invalidate(); setAdding(false); setForm(EMPTY); },
  });
  const updateMutation = trpc.currencies.update.useMutation({
    onSuccess: () => { void utils.currencies.list.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.currencies.delete.useMutation({
    onSuccess: () => void utils.currencies.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function startEdit(c: Currency) {
    setEditing(c.id);
    setEditForm({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      symbolPosition: c.symbolPosition as "before" | "after",
      exchangeRate: typeof c.exchangeRate === "object" ? c.exchangeRate.toNumber() : c.exchangeRate,
      isDefault: c.isDefault,
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-left font-medium">Position</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-left font-medium">Default</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {currencies.map((c) =>
              editing === c.id ? (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <Input value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} className="h-7 w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-7 w-32" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={editForm.symbol} onChange={(e) => setEditForm((p) => ({ ...p, symbol: e.target.value }))} className="h-7 w-16" />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={editForm.symbolPosition}
                      onChange={(e) => setEditForm((p) => ({ ...p, symbolPosition: e.target.value as "before" | "after" }))}
                      className="h-7 rounded border px-1 text-sm"
                    >
                      <option value="before">Before</option>
                      <option value="after">After</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" step="0.0001" value={editForm.exchangeRate} onChange={(e) => setEditForm((p) => ({ ...p, exchangeRate: parseFloat(e.target.value) || 1 }))} className="h-7 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={editForm.isDefault} onChange={(e) => setEditForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={() => updateMutation.mutate({ id: c.id, ...editForm })} disabled={updateMutation.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-medium">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.symbol}</td>
                  <td className="px-3 py-2 capitalize">{c.symbolPosition}</td>
                  <td className="px-3 py-2 text-right">{typeof c.exchangeRate === "object" ? c.exchangeRate.toNumber() : c.exchangeRate}</td>
                  <td className="px-3 py-2">{c.isDefault && <span className="text-xs font-medium text-green-600">Default</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(c)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => deleteMutation.mutate({ id: c.id })} className="text-xs text-destructive hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {currencies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No currencies yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="rounded-lg border p-4 space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium">Code</label>
              <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="USD" className="mt-1 h-8" />
            </div>
            <div>
              <label className="text-xs font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="US Dollar" className="mt-1 h-8" />
            </div>
            <div>
              <label className="text-xs font-medium">Symbol</label>
              <Input value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} placeholder="$" className="mt-1 h-8" />
            </div>
            <div>
              <label className="text-xs font-medium">Position</label>
              <select
                value={form.symbolPosition}
                onChange={(e) => setForm((p) => ({ ...p, symbolPosition: e.target.value as "before" | "after" }))}
                className="mt-1 h-8 w-full rounded-md border px-2 text-sm"
              >
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Exchange Rate</label>
              <Input type="number" step="0.0001" value={form.exchangeRate} onChange={(e) => setForm((p) => ({ ...p, exchangeRate: parseFloat(e.target.value) || 1 }))} className="mt-1 h-8" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                Set as default
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setError(null);
                createMutation.mutate(form, {
                  onError: (e) => {
                    const zodError = (e.data as { zodError?: { fieldErrors: Record<string, string[]> } } | undefined)?.zodError;
                    if (zodError?.fieldErrors) {
                      const msgs = Object.entries(zodError.fieldErrors)
                        .map(([f, errs]) => `${f}: ${errs[0]}`)
                        .join(", ");
                      setError(msgs);
                    } else {
                      setError(e.message);
                    }
                  },
                });
              }}
              disabled={createMutation.isPending || !form.code || !form.name || !form.symbol}
            >
              {createMutation.isPending ? "Adding…" : "Add Currency"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setForm(EMPTY); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Add Currency</Button>
      )}
    </div>
  );
}
