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

const MAX_RECEIPT_BYTES = 3_000_000;

type ReceiptMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "application/pdf";

const ALLOWED_RECEIPT_MIME_TYPES: ReceiptMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

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
    paidAt: "",
    dueDate: "",
    paymentDetails: "",
    taxId: "",
    categoryId: "",
    supplierId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);

  const scanMutation = trpc.expenses.scanReceipt.useMutation({
    onSuccess: (result) => {
      const draft = result.draft;
      setForm((prev) => ({
        ...prev,
        name: draft.name,
        description: draft.description ?? prev.description,
        qty: draft.qty,
        rate: draft.rate ? String(draft.rate) : "",
        paidAt: draft.paidAt ?? prev.paidAt,
        categoryId: draft.categoryId ?? "",
        supplierId: draft.supplierId ?? "",
      }));
      setScanWarnings(result.warnings);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const mutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate({ projectId });
      setForm({
        name: "",
        description: "",
        qty: 1,
        rate: "",
        paidAt: "",
        dueDate: "",
        paymentDetails: "",
        taxId: "",
        categoryId: "",
        supplierId: "",
      });
      setScanWarnings([]);
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  async function handleReceiptFile(file: File | null) {
    if (!file) return;
    setError(null);
    setScanWarnings([]);
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(file.type as ReceiptMimeType)) {
      setError("Upload a JPG, PNG, GIF, WebP, or PDF receipt.");
      return;
    }
    const mimeType = file.type as ReceiptMimeType;
    // Keep the base64 payload under the server cap (~4.2 MB) and Netlify's
    // 6 MB function-body limit. 3 MB binary ≈ 4 MB base64.
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("Receipt file must be under 3 MB.");
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("Could not read receipt file."));
        reader.readAsDataURL(file);
      });
    } catch {
      setError("Could not read the receipt file. Try a different file.");
      return;
    }

    scanMutation.mutate({
      projectId,
      fileName: file.name,
      mimeType,
      dataBase64: dataUrl,
    });
  }

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
      paidAt: form.paidAt ? new Date(form.paidAt) : undefined,
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

      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
        <label className="text-sm font-medium">Scan receipt</label>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a receipt photo or PDF (up to 3 MB) to prefill a draft expense. Review the fields before saving.
        </p>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          disabled={scanMutation.isPending}
          onChange={(e) => handleReceiptFile(e.target.files?.[0] ?? null)}
          className="mt-2"
        />
        {scanMutation.isPending && (
          <p className="mt-2 text-xs text-muted-foreground">Scanning receipt…</p>
        )}
        {scanWarnings.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-medium">Review before saving</p>
            <ul className="mt-1 list-disc pl-4">
              {scanWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Paid Date</label>
          <Input
            type="date"
            value={form.paidAt}
            onChange={(e) => setForm((p) => ({ ...p, paidAt: e.target.value }))}
            className="mt-1"
          />
        </div>
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
