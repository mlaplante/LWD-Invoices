"use client";

import React from "react";
import { InvoiceType } from "@/generated/prisma";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceFormData } from "./InvoiceForm";

const TYPE_LABELS: Record<InvoiceType, string> = {
  [InvoiceType.DETAILED]: "Invoice (Detailed)",
  [InvoiceType.SIMPLE]: "Invoice (Simple)",
  [InvoiceType.ESTIMATE]: "Estimate",
  [InvoiceType.CREDIT_NOTE]: "Credit Note",
  [InvoiceType.DEPOSIT]: "Deposit",
};

type Props = {
  form: InvoiceFormData;
  setForm: React.Dispatch<React.SetStateAction<InvoiceFormData>>;
  clients: { id: string; name: string; defaultPaymentTermsDays: number | null }[];
  currencies: { id: string; code: string; symbol: string; symbolPosition: string }[];
  onClientChange: (clientId: string) => void;
  onDateChange: (newDate: string) => void;
};

export function InvoiceMetadata({
  form,
  setForm,
  clients,
  currencies,
  onClientChange,
  onDateChange,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Client */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Client</label>
        <Select
          value={form.clientId}
          onValueChange={(v: string) => onClientChange(v)}
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
          onChange={(e) => onDateChange(e.target.value)}
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
  );
}
