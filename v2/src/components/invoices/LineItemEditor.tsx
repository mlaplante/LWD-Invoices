"use client";

import React from "react";
import { LineType } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { calculateLineTotals, type TaxInput } from "@/server/services/tax-calculator";

export type LineItemValue = {
  id?: string; // undefined for new lines
  sort: number;
  lineType: LineType;
  name: string;
  description?: string;
  qty: number;
  rate: number;
  period?: number;
  discount: number;
  discountIsPercentage: boolean;
  taxIds: string[];
  sourceTable?: string;
  sourceId?: string;
};

type TaxOption = {
  id: string;
  name: string;
  rate: number;
  isCompound: boolean;
};

type Props = {
  lines: LineItemValue[];
  taxes: TaxOption[];
  currencySymbol: string;
  onChange: (lines: LineItemValue[]) => void;
};

const PERIOD_TYPES: LineType[] = [
  LineType.PERIOD_DAY,
  LineType.PERIOD_WEEK,
  LineType.PERIOD_MONTH,
  LineType.PERIOD_YEAR,
];

const LINE_TYPE_LABELS: Record<LineType, string> = {
  [LineType.STANDARD]: "Standard",
  [LineType.TIME_ENTRY]: "Time Entry",
  [LineType.FLAT_RATE]: "Flat Rate",
  [LineType.EXPENSE]: "Expense",
  [LineType.PERCENTAGE_DISCOUNT]: "% Discount",
  [LineType.FIXED_DISCOUNT]: "Fixed Discount",
  [LineType.PERIOD_DAY]: "Per Day",
  [LineType.PERIOD_WEEK]: "Per Week",
  [LineType.PERIOD_MONTH]: "Per Month",
  [LineType.PERIOD_YEAR]: "Per Year",
};

function fmt(n: number, symbol: string): string {
  return `${symbol}${n.toFixed(2)}`;
}

function computeLineResult(line: LineItemValue, taxes: TaxOption[]) {
  const taxInputs: TaxInput[] = taxes
    .filter((t) => line.taxIds.includes(t.id))
    .map((t) => ({ id: t.id, rate: t.rate, isCompound: t.isCompound }));
  return calculateLineTotals(
    {
      qty: line.qty,
      rate: line.rate,
      period: line.period,
      lineType: line.lineType,
      discount: line.discount,
      discountIsPercentage: line.discountIsPercentage,
      taxIds: line.taxIds,
    },
    taxInputs
  );
}

function newLine(sort: number): LineItemValue {
  return {
    sort,
    lineType: LineType.STANDARD,
    name: "",
    qty: 1,
    rate: 0,
    discount: 0,
    discountIsPercentage: false,
    taxIds: [],
  };
}

export function LineItemEditor({ lines, taxes, currencySymbol, onChange }: Props) {
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<number>>(
    new Set()
  );

  function updateLine(index: number, patch: Partial<LineItemValue>) {
    const updated = lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(updated);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function addLine() {
    onChange([...lines, newLine(lines.length)]);
  }

  function toggleDescription(index: number) {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleTax(index: number, taxId: string) {
    const line = lines[index];
    const taxIds = line.taxIds.includes(taxId)
      ? line.taxIds.filter((id) => id !== taxId)
      : [...line.taxIds, taxId];
    updateLine(index, { taxIds });
  }

  const isPeriodType = (lt: LineType) => PERIOD_TYPES.includes(lt);
  const isDiscountType = (lt: LineType) =>
    lt === LineType.PERCENTAGE_DISCOUNT || lt === LineType.FIXED_DISCOUNT;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-[24px_2fr_80px_120px_80px_80px_120px_100px_32px] gap-2 px-2 text-xs font-medium text-muted-foreground">
        <span />
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Discount</span>
        <span className="text-right">Period</span>
        <span>Taxes</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {lines.map((line, i) => {
        const result = computeLineResult(line, taxes);
        const showPeriod = isPeriodType(line.lineType);
        const isDiscount = isDiscountType(line.lineType);

        return (
          <div key={i} className="rounded-md border bg-card">
            <div className="grid grid-cols-[24px_2fr_80px_120px_80px_80px_120px_100px_32px] gap-2 items-start p-2">
              {/* Drag handle */}
              <button
                type="button"
                className="mt-2 cursor-grab text-muted-foreground"
                title="Drag to reorder"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              {/* Name + type */}
              <div className="space-y-1">
                <div className="flex gap-1">
                  <Input
                    placeholder="Item name"
                    value={line.name}
                    onChange={(e) => updateLine(i, { name: e.target.value })}
                    className="h-8 text-sm"
                  />
                  <Select
                    value={line.lineType}
                    onValueChange={(v: string) => updateLine(i, { lineType: v as LineType })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => toggleDescription(i)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Toggle description"
                  >
                    {expandedDescriptions.has(i) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {expandedDescriptions.has(i) && (
                  <Input
                    placeholder="Description (optional)"
                    value={line.description ?? ""}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="h-7 text-xs text-muted-foreground"
                  />
                )}
              </div>

              {/* Qty */}
              <Input
                type="number"
                min={0}
                step="any"
                value={line.qty}
                onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                className="h-8 text-right text-sm"
                disabled={isDiscount}
              />

              {/* Rate */}
              <Input
                type="number"
                min={0}
                step="any"
                value={line.rate}
                onChange={(e) => updateLine(i, { rate: Number(e.target.value) })}
                className="h-8 text-right text-sm"
              />

              {/* Discount */}
              <div className="flex gap-0.5">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={line.discount}
                  onChange={(e) => updateLine(i, { discount: Number(e.target.value) })}
                  className="h-8 w-full text-right text-sm"
                  disabled={isDiscount}
                />
                <button
                  type="button"
                  onClick={() =>
                    updateLine(i, {
                      discountIsPercentage: !line.discountIsPercentage,
                    })
                  }
                  className="h-8 rounded border px-1 text-xs hover:bg-muted"
                  title={
                    line.discountIsPercentage ? "Switch to fixed" : "Switch to %"
                  }
                  disabled={isDiscount}
                >
                  {line.discountIsPercentage ? "%" : "$"}
                </button>
              </div>

              {/* Period */}
              <Input
                type="number"
                min={0}
                step="any"
                value={line.period ?? ""}
                onChange={(e) =>
                  updateLine(i, {
                    period: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="h-8 text-right text-sm"
                disabled={!showPeriod}
                placeholder={showPeriod ? "1" : "—"}
              />

              {/* Tax multi-select */}
              <div className="flex flex-wrap gap-1">
                {taxes.map((tax) => (
                  <button
                    key={tax.id}
                    type="button"
                    onClick={() => toggleTax(i, tax.id)}
                    className={`rounded px-1.5 py-0.5 text-xs border transition-colors ${
                      line.taxIds.includes(tax.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {tax.name} {tax.rate}%
                  </button>
                ))}
              </div>

              {/* Calculated total */}
              <div className="text-right text-sm font-medium">
                <div>{fmt(result.total, currencySymbol)}</div>
                {result.taxTotal > 0 && (
                  <div className="text-xs text-muted-foreground">
                    tax: {fmt(result.taxTotal, currencySymbol)}
                  </div>
                )}
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="mt-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        + Add Line Item
      </Button>
    </div>
  );
}
