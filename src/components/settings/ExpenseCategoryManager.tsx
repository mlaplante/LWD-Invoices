"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Category = { id: string; name: string };
type Props = { initialCategories: Category[] };

export function ExpenseCategoryManager({ initialCategories }: Props) {
  const utils = trpc.useUtils();
  const { data: categories = initialCategories } = trpc.expenseCategories.list.useQuery(undefined);

  const createMutation = trpc.expenseCategories.create.useMutation({
    onSuccess: () => { void utils.expenseCategories.list.invalidate(); setAdding(false); setName(""); },
  });
  const updateMutation = trpc.expenseCategories.update.useMutation({
    onSuccess: () => { void utils.expenseCategories.list.invalidate(); setEditing(null); },
  });
  const deleteMutation = trpc.expenseCategories.delete.useMutation({
    onSuccess: () => void utils.expenseCategories.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function startEdit(c: Category) {
    setEditing(c.id);
    setEditName(c.name);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Category Name</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((c) =>
              editing === c.id ? (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-7 w-56"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateMutation.mutate({ id: c.id, name: editName })}
                        disabled={updateMutation.isPending || !editName.trim()}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(c)} className="text-xs text-blue-600 hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: c.id })}
                        className="text-xs text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {categories.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <label className="text-xs font-medium">Category Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Expenses"
              className="mt-1 h-8 max-w-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ name })}
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? "Adding…" : "Add Category"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setName(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          + Add Category
        </Button>
      )}
    </div>
  );
}
