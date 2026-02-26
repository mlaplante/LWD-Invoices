"use client";

import React, { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { InvoiceType } from "@/generated/prisma";
import { toast } from "sonner";
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
import { LineItemEditor, type LineItemValue } from "./LineItemEditor";
import { calculateInvoiceTotals, type TaxInput } from "@/server/services/tax-calculator";
import { trpc } from "@/trpc/client";

type InvoiceFormData = {
  id?: string;
  type: InvoiceType;
  date: string;
  dueDate?: string;
  currencyId: string;
  number?: string;
  notes?: string;
  clientId: string;
  lines: LineItemValue[];
  reminderDaysOverride: number[];
};

type Props = {
  mode: "create" | "edit";
  initialData?: Partial<InvoiceFormData>;
  orgPaymentTermsDays: number;
  clients: { id: string; name: string; defaultPaymentTermsDays: number | null }[];
  currencies: { id: string; code: string; symbol: string; symbolPosition: string }[];
  taxes: { id: string; name: string; rate: number; isCompound: boolean }[];
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  [InvoiceType.DETAILED]: "Invoice (Detailed)",
  [InvoiceType.SIMPLE]: "Invoice (Simple)",
  [InvoiceType.ESTIMATE]: "Estimate",
  [InvoiceType.CREDIT_NOTE]: "Credit Note",
};

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7, 14, 30];

export function InvoiceForm({ mode, initialData, orgPaymentTermsDays, clients, currencies, taxes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const savingRef = useRef(false);

  const defaultCurrency = currencies[0];

  const [form, setForm] = useState<InvoiceFormData>({
    type: InvoiceType.DETAILED,
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currencyId: defaultCurrency?.id ?? "",
    clientId: "",
    notes: "",
    lines: [],
    reminderDaysOverride: initialData?.reminderDaysOverride ?? [],
    ...initialData,
  });

  const [useCustomReminders, setUseCustomReminders] = useState(
    (initialData?.reminderDaysOverride?.length ?? 0) > 0
  );

  const activeCurrency =
    currencies.find((c) => c.id === form.currencyId) ?? defaultCurrency;

  const taxOptions = taxes.map((t) => ({
    id: t.id,
    name: t.name,
    rate: Number(t.rate),
    isCompound: t.isCompound,
  }));

  const taxInputs: TaxInput[] = taxOptions;

  const invoiceTotals = calculateInvoiceTotals(
    form.lines.map((l) => ({
      qty: l.qty,
      rate: l.rate,
      period: l.period,
      lineType: l.lineType,
      discount: l.discount,
      discountIsPercentage: l.discountIsPercentage,
      taxIds: l.taxIds,
    })),
    taxInputs
  );

  const sym = activeCurrency?.symbol ?? "$";
  const symPos = activeCurrency?.symbolPosition ?? "before";
  const fmt = (n: number) =>
    symPos === "before" ? `${sym}${n.toFixed(2)}` : `${n.toFixed(2)}${sym}`;

  const createMutation = trpc.invoices.create.useMutation();
  const updateMutation = trpc.invoices.update.useMutation();

  function handleClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    const termsDays = client?.defaultPaymentTermsDays ?? orgPaymentTermsDays;
    if (termsDays === 0) {
      setForm((p) => ({ ...p, clientId, dueDate: p.date }));
    } else {
      const due = new Date(form.date);
      due.setDate(due.getDate() + termsDays);
      setForm((p) => ({ ...p, clientId, dueDate: due.toISOString().slice(0, 10) }));
    }
  }

  function buildInput() {
    return {
      type: form.type,
      date: new Date(form.date),
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      currencyId: form.currencyId,
      clientId: form.clientId,
      notes: form.notes || undefined,
      reminderDaysOverride: form.reminderDaysOverride,
      lines: form.lines.map((l, idx) => ({
        sort: idx,
        lineType: l.lineType,
        name: l.name,
        description: l.description || undefined,
        qty: l.qty,
        rate: l.rate,
        period: l.period,
        discount: l.discount,
        discountIsPercentage: l.discountIsPercentage,
        taxIds: l.taxIds,
        sourceTable: l.sourceTable,
        sourceId: l.sourceId,
      })),
    };
  }

  function handleSave(andSend = false) {
    if (savingRef.current) return;
    savingRef.current = true;
    startTransition(async () => {
      try {
        if (mode === "create") {
          const inv = await createMutation.mutateAsync(buildInput());
          router.push(andSend ? `/invoices/${inv.id}?send=1` : `/invoices/${inv.id}`);
        } else if (form.id) {
          const inv = await updateMutation.mutateAsync({ id: form.id, ...buildInput() });
          router.push(`/invoices/${inv.id}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save invoice");
      } finally {
        savingRef.current = false;
      }
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Client */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Client</label>
          <Select
            value={form.clientId}
            onValueChange={(v: string) => handleClientChange(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Type */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Type</label>
          <Select
            value={form.type}
            onValueChange={(v: string) =>
              setForm((f) => ({ ...f, type: v as InvoiceType }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Date</label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>

        {/* Due Date */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Due Date</label>
          <Input
            type="date"
            value={form.dueDate ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </div>

        {/* Currency */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Currency</label>
          <Select
            value={form.currencyId}
            onValueChange={(v: string) => setForm((f) => ({ ...f, currencyId: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Invoice number (edit only) */}
        {form.number !== undefined && (
          <div className="space-y-1">
            <label className="text-sm font-medium">Invoice Number</label>
            <Input
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              placeholder="Auto-assigned"
            />
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Line Items</h3>
        <LineItemEditor
          lines={form.lines}
          taxes={taxOptions}
          currencySymbol={sym}
          onChange={(lines) => setForm((f) => ({ ...f, lines }))}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Payment terms, bank details, thank you message…"
          rows={3}
        />
      </div>

      {/* Reminder override */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={!useCustomReminders}
            onChange={(e) => {
              setUseCustomReminders(!e.target.checked);
              if (e.target.checked) setForm((p) => ({ ...p, reminderDaysOverride: [] }));
            }}
            className="rounded"
          />
          Use org default reminder schedule
        </label>
        {useCustomReminders && (
          <div className="mt-2 flex flex-wrap gap-2 pl-1">
            {REMINDER_DAY_OPTIONS.map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.reminderDaysOverride.includes(d)}
                  onChange={(e) => {
                    setForm((p) => ({
                      ...p,
                      reminderDaysOverride: e.target.checked
                        ? [...p.reminderDaysOverride, d].sort((a, b) => a - b)
                        : p.reminderDaysOverride.filter((x) => x !== d),
                    }));
                  }}
                  className="rounded"
                />
                {d === 1 ? "1 day" : `${d} days`}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Totals panel */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1.5 rounded-lg border p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{fmt(invoiceTotals.subtotal)}</span>
          </div>
          {invoiceTotals.discountTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span>-{fmt(invoiceTotals.discountTotal)}</span>
            </div>
          )}
          {invoiceTotals.taxTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{fmt(invoiceTotals.taxTotal)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-base font-bold">
            <span>Total</span>
            <span>{fmt(invoiceTotals.total)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {currencies.length === 0 && (
        <p className="text-sm text-destructive">
          You need to{" "}
          <a href="/settings" className="underline">
            add a currency in Settings
          </a>{" "}
          before creating invoices.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={isSaving || !form.clientId || !form.currencyId}
        >
          {isSaving ? "Saving…" : "Save as Draft"}
        </Button>
        <Button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isSaving || !form.clientId || !form.currencyId}
        >
          {isSaving ? "Saving…" : "Save & Send"}
        </Button>
      </div>
    </div>
  );
}
