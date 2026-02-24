"use client";

import { useState } from "react";
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

type Tax = { id: string; name: string; rate: { toNumber(): number } };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };

type Props = {
  projectId: string;
  taxes: Tax[];
  categories: Category[];
  suppliers: Supplier[];
  onSuccess?: () => void;
};

export function ExpenseForm({ projectId, taxes, categories, suppliers, onSuccess }: Props) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "",
    description: "",
    qty: 1,
    rate: "",
    dueDate: "",
    paymentDetails: "",
    taxId: "",
    categoryId: "",
    supplierId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate({ projectId });
      setForm({
        name: "",
        description: "",
        qty: 1,
        rate: "",
        dueDate: "",
        paymentDetails: "",
        taxId: "",
        categoryId: "",
        supplierId: "",
      });
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = parseFloat(form.rate);
    if (isNaN(rate)) {
      setError("Enter a valid amount.");
      return;
    }
    mutation.mutate({
      projectId,
      name: form.name,
      description: form.description || undefined,
      qty: form.qty,
      rate,
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      paymentDetails: form.paymentDetails || undefined,
      taxId: form.taxId || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
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
        <label className="text-sm font-medium">Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Expense name"
          required
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Qty</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={form.qty}
            onChange={(e) => setForm((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Amount (each)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.rate}
            onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
            placeholder="0.00"
            required
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Tax</label>
          <Select
            value={form.taxId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, taxId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="No tax" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.rate.toNumber()}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Category</label>
          <Select
            value={form.categoryId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Supplier</label>
          <Select
            value={form.supplierId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Due Date</label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Payment Details</label>
          <Input
            value={form.paymentDetails}
            onChange={(e) => setForm((p) => ({ ...p, paymentDetails: e.target.value }))}
            placeholder="Optional"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional"
          rows={2}
          className="mt-1"
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Adding…" : "Add Expense"}
      </Button>
    </form>
  );
}
