"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";

type Tax = { id: string; name: string; rate: number };
type Category = { id: string; name: string };
type Supplier = { id: string; name: string };
type Project = { id: string; name: string };

type BaseProps = {
  taxes: Tax[];
  categories: Category[];
  suppliers: Supplier[];
  projects: Project[];
  defaults?: {
    name?: string;
    description?: string;
    qty?: number;
    rate?: number;
    dueDate?: string;
    paidAt?: string;
    reimbursable?: boolean;
    paymentDetails?: string;
    taxId?: string;
    categoryId?: string;
    supplierId?: string;
    projectId?: string;
  };
};

type Props =
  | (BaseProps & { mode: "create"; expenseId?: never })
  | (BaseProps & { mode: "edit"; expenseId: string });

export function ExpenseForm({
  mode,
  expenseId,
  taxes,
  categories,
  suppliers,
  projects,
  defaults = {},
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: defaults.name ?? "",
    description: defaults.description ?? "",
    qty: defaults.qty ?? 1,
    rate: defaults.rate != null ? String(defaults.rate) : "",
    dueDate: defaults.dueDate ?? "",
    paidAt: defaults.paidAt ?? "",
    reimbursable: defaults.reimbursable ?? false,
    paymentDetails: defaults.paymentDetails ?? "",
    taxId: defaults.taxId ?? "",
    categoryId: defaults.categoryId ?? "",
    supplierId: defaults.supplierId ?? "",
    projectId: defaults.projectId ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense created");
      router.push("/expenses");
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Expense updated");
      router.push("/expenses");
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = parseFloat(form.rate);
    if (isNaN(rate)) {
      setError("Enter a valid amount.");
      return;
    }

    if (mode === "create") {
      createMutation.mutate({
        name: form.name,
        description: form.description || undefined,
        qty: form.qty,
        rate,
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        paidAt: form.paidAt ? new Date(form.paidAt) : undefined,
        reimbursable: form.reimbursable,
        paymentDetails: form.paymentDetails || undefined,
        taxId: form.taxId || undefined,
        categoryId: form.categoryId || undefined,
        supplierId: form.supplierId || undefined,
        projectId: form.projectId || undefined,
      });
    } else {
      updateMutation.mutate({
        id: expenseId,
        name: form.name,
        description: form.description || undefined,
        qty: form.qty,
        rate,
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        paidAt: form.paidAt ? new Date(form.paidAt) : null,
        reimbursable: form.reimbursable,
        paymentDetails: form.paymentDetails || undefined,
        taxId: form.taxId || null,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        projectId: form.projectId || null,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Software subscription"
          required
          className="mt-1"
        />
      </div>

      {/* Amount + Qty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Amount (each) <span className="text-destructive">*</span></label>
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
      </div>

      {/* Category + Supplier + Tax */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Category</label>
          <Select
            value={form.categoryId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Tax</label>
          <Select
            value={form.taxId || "none"}
            onValueChange={(v) => setForm((p) => ({ ...p, taxId: v === "none" ? "" : v }))}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="No tax" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project (optional) */}
      <div>
        <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Select
          value={form.projectId || "none"}
          onValueChange={(v) => setForm((p) => ({ ...p, projectId: v === "none" ? "" : v }))}
        >
          <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked to a project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked to a project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Paid At + Reimbursable */}
      <div className="grid grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Date Paid</label>
          <Input
            type="date"
            value={form.paidAt}
            onChange={(e) => setForm((p) => ({ ...p, paidAt: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            id="reimbursable"
            checked={form.reimbursable}
            onChange={(e) => setForm((p) => ({ ...p, reimbursable: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="reimbursable" className="text-sm font-medium cursor-pointer">
            Reimbursable
          </label>
        </div>
      </div>

      {/* Due Date + Payment Details */}
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

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional notes"
          rows={2}
          className="mt-1"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : mode === "create" ? "Create Expense" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/expenses")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
