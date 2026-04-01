"use client";

import { useRef, useState } from "react";
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
import { Paperclip, X, ExternalLink } from "lucide-react";
import { ReceiptOCRDropzone } from "./ReceiptOCRDropzone";
import type { OCRResult } from "@/server/services/receipt-ocr";

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
    receiptUrl?: string;
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
  const fileRef = useRef<HTMLInputElement>(null);

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
  const [receiptUrl, setReceiptUrl] = useState<string>(defaults.receiptUrl ?? "");
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<OCRResult | null>(null);

  function handleOCRResult(data: {
    ocr: OCRResult;
    matches: { supplierId: string | null; categoryId: string | null };
    receiptUrl: string;
  }) {
    setOcrData(data.ocr);
    setReceiptUrl(data.receiptUrl);

    // Pre-fill empty form fields from OCR data
    setForm((prev) => ({
      ...prev,
      name: prev.name || data.ocr.vendor || "",
      rate: prev.rate || (data.ocr.amount != null ? String(data.ocr.amount) : ""),
      dueDate: prev.dueDate || data.ocr.date || "",
      categoryId: prev.categoryId || data.matches.categoryId || "",
      supplierId: prev.supplierId || data.matches.supplierId || "",
    }));
  }

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

  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/expenses/receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setReceiptUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setReceiptUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
        receiptUrl: receiptUrl || undefined,
        taxId: form.taxId || undefined,
        categoryId: form.categoryId || undefined,
        supplierId: form.supplierId || undefined,
        projectId: form.projectId || undefined,
        ocrRawResult: ocrData?.rawResponse ?? undefined,
        ocrConfidence: ocrData?.confidence ?? undefined,
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
        receiptUrl: receiptUrl || null,
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

      {/* Receipt OCR Dropzone — shown in create mode when no receipt attached */}
      {mode === "create" && !receiptUrl && (
        <div>
          <label className="text-sm font-medium">Scan Receipt</label>
          <div className="mt-1">
            <ReceiptOCRDropzone onResult={handleOCRResult} />
          </div>
        </div>
      )}

      {/* Receipt */}
      <div>
        <label className="text-sm font-medium">Receipt</label>
        <div className="mt-1 space-y-2">
          {receiptUrl ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-primary hover:underline"
              >
                View receipt
                <ExternalLink className="inline ml-1 w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => setReceiptUrl("")}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                onChange={handleReceiptChange}
                className="hidden"
                id="receipt-upload"
              />
              <label
                htmlFor="receipt-upload"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                {receiptUploading ? "Uploading…" : "Attach receipt"}
              </label>
              <span className="text-xs text-muted-foreground">PNG, JPEG, PDF — max 10 MB</span>
            </div>
          )}
        </div>
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
