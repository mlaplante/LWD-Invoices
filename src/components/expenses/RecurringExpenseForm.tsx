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
    reimbursable?: boolean;
    taxId?: string;
    categoryId?: string;
    supplierId?: string;
    projectId?: string;
    frequency?: string;
    interval?: number;
    startDate?: string;
    endDate?: string;
    maxOccurrences?: number;
  };
};

type Props =
  | (BaseProps & { mode: "create"; recurringExpenseId?: never })
  | (BaseProps & { mode: "edit"; recurringExpenseId: string });

const FREQUENCIES = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export function RecurringExpenseForm({
  mode,
  recurringExpenseId,
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
    reimbursable: defaults.reimbursable ?? false,
    taxId: defaults.taxId ?? "",
    categoryId: defaults.categoryId ?? "",
    supplierId: defaults.supplierId ?? "",
    projectId: defaults.projectId ?? "",
    frequency: defaults.frequency ?? "MONTHLY",
    interval: defaults.interval ?? 1,
    startDate: defaults.startDate ?? "",
    endDate: defaults.endDate ?? "",
    maxOccurrences: defaults.maxOccurrences != null ? String(defaults.maxOccurrences) : "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.recurringExpenses.create.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense created");
      router.push("/expenses/recurring");
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.recurringExpenses.update.useMutation({
    onSuccess: () => {
      utils.recurringExpenses.list.invalidate();
      toast.success("Recurring expense updated");
      router.push("/expenses/recurring");
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rate = parseFloat(form.rate);
    if (isNaN(rate)) { setError("Enter a valid amount."); return; }
    if (!form.startDate) { setError("Start date is required."); return; }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      qty: form.qty,
      rate,
      reimbursable: form.reimbursable,
      frequency: form.frequency as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
      interval: form.interval,
      startDate: new Date(form.startDate),
      endDate: form.endDate ? new Date(form.endDate) : undefined,
      maxOccurrences: form.maxOccurrences ? parseInt(form.maxOccurrences) : undefined,
      taxId: form.taxId || undefined,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      projectId: form.projectId || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: recurringExpenseId, ...payload });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Name */}
      <div>
        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Office Rent"
          required
          className="mt-1"
        />
      </div>

      {/* Amount + Qty */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Amount (each) <span className="text-destructive">*</span></label>
          <Input
            type="number" min="0" step="0.01"
            value={form.rate}
            onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
            placeholder="0.00" required className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Qty</label>
          <Input
            type="number" min="1" step="1"
            value={form.qty}
            onChange={(e) => setForm((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>
      </div>

      {/* Schedule: Frequency + Interval */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Frequency <span className="text-destructive">*</span></label>
          <Select value={form.frequency} onValueChange={(v) => setForm((p) => ({ ...p, frequency: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Every N periods</label>
          <Input
            type="number" min="1" step="1"
            value={form.interval}
            onChange={(e) => setForm((p) => ({ ...p, interval: parseInt(e.target.value) || 1 }))}
            className="mt-1"
          />
        </div>
      </div>

      {/* Schedule: Start + End + Max */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Start Date <span className="text-destructive">*</span></label>
          <Input
            type="date" value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            required className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Date <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            type="date" value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Max Occurrences <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input
            type="number" min="1" step="1"
            value={form.maxOccurrences}
            onChange={(e) => setForm((p) => ({ ...p, maxOccurrences: e.target.value }))}
            placeholder="Unlimited" className="mt-1"
          />
        </div>
      </div>

      {/* Category + Supplier + Tax */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Category</label>
          <Select value={form.categoryId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Supplier</label>
          <Select value={form.supplierId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Tax</label>
          <Select value={form.taxId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, taxId: v === "none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="No tax" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No tax</SelectItem>
              {taxes.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Project */}
      <div>
        <label className="text-sm font-medium">Project <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Select value={form.projectId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, projectId: v === "none" ? "" : v }))}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked to a project</SelectItem>
            {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Reimbursable */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox" id="reimbursable"
          checked={form.reimbursable}
          onChange={(e) => setForm((p) => ({ ...p, reimbursable: e.target.checked }))}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="reimbursable" className="text-sm font-medium cursor-pointer">Reimbursable</label>
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional notes" rows={2} className="mt-1"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : mode === "create" ? "Create Recurring Expense" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/expenses/recurring")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
