"use client";

import React from "react";
import { InvoiceType } from "@/generated/prisma";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CanvasLineRows } from "./CanvasLineRows";
import { EditableText, EditableDate } from "./editable";
import { formatDate } from "@/lib/format";
import type { CanvasTheme } from "./canvas-theme";
import type { TaxOption } from "../line-item-utils";
import type { InvoiceFormData } from "../InvoiceForm";
import type { InvoiceTotalsWithDiscount } from "@/server/services/tax-calculator";

export type InvoiceCanvasProps = {
  value: InvoiceFormData;
  onChange: React.Dispatch<React.SetStateAction<InvoiceFormData>>;
  onClientChange: (clientId: string) => void; // InvoiceForm's handler (recalcs due date)
  onDateChange: (newDate: string) => void; // InvoiceForm's handler
  readOnly?: boolean;
  clients: { id: string; name: string; defaultPaymentTermsDays: number | null }[];
  currencies: { id: string; code: string; symbol: string; symbolPosition: string }[];
  taxes: TaxOption[];
  totals: InvoiceTotalsWithDiscount; // computed by InvoiceForm, single source
  fmt: (n: number) => string;
  org: { name: string; logoUrl: string | null };
  theme: CanvasTheme;
  footerText: string | null;
};

// Matches the PDF templates' typeLabel maps (see pdf-templates/*.tsx), extended
// to cover DEPOSIT explicitly rather than relying on a fallback.
const DOC_TYPE_LABELS: Record<InvoiceType, string> = {
  [InvoiceType.SIMPLE]: "INVOICE",
  [InvoiceType.DETAILED]: "INVOICE",
  [InvoiceType.DEPOSIT]: "INVOICE",
  [InvoiceType.ESTIMATE]: "ESTIMATE",
  [InvoiceType.CREDIT_NOTE]: "CREDIT NOTE",
};

// Labels for the header's type switcher — distinct from DOC_TYPE_LABELS since
// SIMPLE/DETAILED/DEPOSIT all share the "INVOICE" document label but need to
// stay individually selectable.
const TYPE_SELECT_LABELS: Record<InvoiceType, string> = {
  [InvoiceType.SIMPLE]: "Simple Invoice",
  [InvoiceType.DETAILED]: "Detailed Invoice",
  [InvoiceType.DEPOSIT]: "Deposit Invoice",
  [InvoiceType.ESTIMATE]: "Estimate",
  [InvoiceType.CREDIT_NOTE]: "Credit Note",
};

const HOVER_TINT = "hover:bg-[color-mix(in_oklch,var(--canvas-accent)_8%,transparent)]";

export function InvoiceCanvas({
  value,
  onChange,
  onClientChange,
  onDateChange,
  readOnly = false,
  clients,
  currencies,
  taxes,
  totals,
  fmt,
  org,
  theme,
  footerText,
}: InvoiceCanvasProps) {
  const activeClient = clients.find((c) => c.id === value.clientId);
  const activeCurrency = currencies.find((c) => c.id === value.currencyId) ?? currencies[0];
  const currencySymbol = activeCurrency?.symbol ?? "$";
  const compact = theme.density === "compact";
  const sectionPad = compact ? "px-8 py-2" : "px-8 py-4";

  return (
    <div
      style={theme.cssVars as React.CSSProperties}
      className="mx-auto max-w-[52rem] rounded-md bg-white text-neutral-900 shadow-md font-[family-name:var(--canvas-font)]"
    >
      {/* 1. Header */}
      <div
        className={
          theme.headerStyle === "banded"
            ? `flex items-center justify-between rounded-t-md bg-[var(--canvas-accent)] px-8 ${compact ? "py-4" : "py-6"} text-white`
            : theme.headerStyle === "ruled"
              ? `flex items-center justify-between border-t-4 border-[var(--canvas-accent)] px-8 ${compact ? "py-4" : "py-6"}`
              : `flex items-center justify-between px-8 ${compact ? "py-6" : "py-10"}`
        }
      >
        <div>
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- org-supplied external logo URL
            <img src={org.logoUrl} alt={org.name} className="h-10 max-w-[180px] object-contain" />
          ) : (
            <span className="text-lg font-semibold">{org.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-wide">{DOC_TYPE_LABELS[value.type]}</span>
          {!readOnly && (
            <Select
              value={value.type}
              onValueChange={(v: string) =>
                onChange((f) => ({ ...f, type: v as InvoiceType }))
              }
            >
              <SelectTrigger
                size="sm"
                aria-label="Invoice type"
                className={`h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs shadow-none ${
                  theme.headerStyle === "banded"
                    ? "text-white/80 hover:bg-white/10 [&_svg]:text-white/80"
                    : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_SELECT_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* 2. Meta row */}
      <div className={`flex flex-wrap items-start justify-between gap-4 ${sectionPad} text-sm`}>
        <div>
          {value.number !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-neutral-500">Invoice #</span>
              {readOnly ? (
                <span className="font-medium">{value.number || "—"}</span>
              ) : (
                <EditableText
                  value={value.number ?? ""}
                  onCommit={(v) => onChange((f) => ({ ...f, number: v }))}
                  placeholder="Auto-assigned"
                  ariaLabel="Invoice number"
                  className="font-medium"
                />
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">Date</span>
            {readOnly ? (
              <span>{formatDate(value.date)}</span>
            ) : (
              <EditableDate
                value={value.date}
                onCommit={onDateChange}
                ariaLabel="Invoice date"
                displayFormat={formatDate}
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">Due</span>
            {readOnly ? (
              <span>{formatDate(value.dueDate)}</span>
            ) : (
              <EditableDate
                value={value.dueDate ?? ""}
                onCommit={(v) => onChange((f) => ({ ...f, dueDate: v }))}
                ariaLabel="Due date"
                displayFormat={formatDate}
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">Currency</span>
            {readOnly ? (
              <span>{activeCurrency?.code ?? ""}</span>
            ) : (
              <Select
                value={value.currencyId}
                onValueChange={(v: string) => onChange((f) => ({ ...f, currencyId: v }))}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Currency"
                  className={`h-7 w-auto gap-1 border-none bg-transparent px-1.5 text-sm shadow-none ${HOVER_TINT}`}
                >
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
            )}
          </div>
        </div>
      </div>

      {/* 3. Bill To */}
      <div className={sectionPad}>
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Bill To
        </div>
        {readOnly ? (
          <div className="mt-1 text-base font-medium">
            {activeClient?.name ?? <span className="font-normal text-neutral-400">No client selected</span>}
          </div>
        ) : (
          <Select value={value.clientId} onValueChange={onClientChange}>
            <SelectTrigger
              size="sm"
              aria-label="Client"
              className={
                activeClient
                  ? `mt-1 h-auto w-auto gap-1 border-none bg-transparent px-1 py-0.5 text-base font-medium shadow-none ${HOVER_TINT}`
                  : "mt-1 h-auto w-auto gap-1 rounded-md border border-dashed border-neutral-300 bg-transparent px-3 py-1.5 text-sm text-neutral-500 shadow-none"
              }
            >
              <SelectValue placeholder="Choose a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 4. Lines */}
      <div className={sectionPad}>
        <CanvasLineRows
          lines={value.lines}
          taxes={taxes}
          currencySymbol={currencySymbol}
          fmt={fmt}
          readOnly={readOnly}
          onChange={(lines) => onChange((f) => ({ ...f, lines }))}
        />
      </div>

      {/* 5. Totals block */}
      <div className={`flex justify-end ${sectionPad}`}>
        <div className="w-72 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Subtotal</span>
            <span>{fmt(totals.subtotal)}</span>
          </div>

          {readOnly ? (
            totals.discountTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Discount</span>
                <span className="text-emerald-600">-{fmt(totals.discountTotal)}</span>
              </div>
            )
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                {/* Combined discountTotal covers line-level discount rows too (see
                    calculateInvoiceTotalsWithDiscount), so any nonzero total gets
                    the amount display even if no invoice-level discount is set —
                    keeps this in sync with the readOnly branch above. The popover
                    itself only edits the invoice-level discount, matching
                    InvoiceForm's Invoice Discount section. */}
                {value.discountType || totals.discountTotal > 0 ? (
                  <button
                    type="button"
                    className={`-mx-1 flex w-[calc(100%+0.5rem)] justify-between rounded px-1 text-sm ${HOVER_TINT}`}
                  >
                    <span className="text-neutral-500">Discount</span>
                    <span className="text-emerald-600">-{fmt(totals.discountTotal)}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`-mx-1 flex w-[calc(100%+0.5rem)] justify-between rounded px-1 text-sm text-neutral-400 ${HOVER_TINT}`}
                  >
                    <span>+ Discount</span>
                    <span />
                  </button>
                )}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Discount Type
                  </label>
                  <Select
                    value={value.discountType ?? "none"}
                    onValueChange={(v: string) =>
                      onChange((f) => ({
                        ...f,
                        discountType: v === "none" ? null : (v as "percentage" | "fixed"),
                        discountAmount: v === "none" ? 0 : (f.discountAmount ?? 0),
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Discount</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {value.discountType && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {value.discountType === "percentage" ? "Percentage" : "Amount"}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={value.discountType === "percentage" ? 100 : undefined}
                        step="0.01"
                        value={value.discountAmount ?? 0}
                        onChange={(e) =>
                          onChange((f) => ({
                            ...f,
                            discountAmount: parseFloat(e.target.value) || 0,
                          }))
                        }
                        placeholder={value.discountType === "percentage" ? "0-100" : "0.00"}
                        className="h-8 text-right text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Description (optional)
                      </label>
                      <Input
                        value={value.discountDescription ?? ""}
                        onChange={(e) =>
                          onChange((f) => ({ ...f, discountDescription: e.target.value }))
                        }
                        placeholder="e.g. Early payment discount"
                        maxLength={200}
                        className="h-8 text-sm"
                      />
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}

          {totals.taxTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Tax</span>
              <span>{fmt(totals.taxTotal)}</span>
            </div>
          )}

          <div className="flex justify-between border-t pt-1.5 text-base font-bold text-[var(--canvas-accent)]">
            <span>Total</span>
            <span>{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* 6. Notes */}
      {(!readOnly || value.notes) && (
        <div className={sectionPad}>
          {readOnly ? (
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{value.notes}</p>
          ) : (
            <EditableText
              value={value.notes ?? ""}
              onCommit={(v) => onChange((f) => ({ ...f, notes: v }))}
              multiline
              placeholder="Payment terms, bank details, thank you message…"
              ariaLabel="Invoice notes"
              className="w-full text-sm text-neutral-700"
            />
          )}
        </div>
      )}

      {/* 7. Footer */}
      {footerText && (
        <div className="border-t px-8 py-4 text-center text-xs text-neutral-400">
          {footerText}
        </div>
      )}
    </div>
  );
}
