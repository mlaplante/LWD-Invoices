"use client";

import React, { useRef } from "react";
import { LineType } from "@/generated/prisma";
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
import { Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { calculateLineTotals, type TaxInput } from "@/server/services/tax-calculator";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// ── Sortable line item ────────────────────────────────────────────────────────

type SortableLineItemProps = {
  line: LineItemValue;
  index: number;
  taxes: TaxOption[];
  currencySymbol: string;
  expandedDescriptions: Set<number>;
  onUpdate: (index: number, patch: Partial<LineItemValue>) => void;
  onRemove: (index: number) => void;
  onToggleDescription: (index: number) => void;
  onToggleTax: (index: number, taxId: string) => void;
};

function SortableLineItem({
  line,
  index,
  taxes,
  currencySymbol,
  expandedDescriptions,
  onUpdate,
  onRemove,
  onToggleDescription,
  onToggleTax,
}: SortableLineItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: line.sort });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const result = computeLineResult(line, taxes);
  const isPeriodType = (lt: LineType) => PERIOD_TYPES.includes(lt);
  const isDiscountType = (lt: LineType) =>
    lt === LineType.PERCENTAGE_DISCOUNT || lt === LineType.FIXED_DISCOUNT;
  const showPeriod = isPeriodType(line.lineType);
  const isDiscount = isDiscountType(line.lineType);

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-card">
      {/* ── Desktop grid layout ── */}
      <div className="hidden sm:grid grid-cols-[24px_2fr_80px_120px_80px_80px_120px_100px_32px] gap-2 items-start p-2">
        {/* Drag handle */}
        <button
          type="button"
          className="mt-2 cursor-grab text-muted-foreground touch-none"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Name + type */}
        <div className="space-y-1">
          <div className="flex gap-1">
            <Input
              placeholder="Item name"
              value={line.name}
              onChange={(e) => onUpdate(index, { name: e.target.value })}
              className="h-8 text-sm"
            />
            <Select
              value={line.lineType}
              onValueChange={(v: string) => onUpdate(index, { lineType: v as LineType })}
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
              onClick={() => onToggleDescription(index)}
              className="text-muted-foreground hover:text-foreground"
              title="Toggle description"
            >
              {expandedDescriptions.has(index) ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
          {expandedDescriptions.has(index) && (
            <Textarea
              placeholder="Description (optional)"
              value={line.description ?? ""}
              onChange={(e) => onUpdate(index, { description: e.target.value })}
              className="min-h-[56px] text-xs text-muted-foreground resize-y"
              rows={2}
            />
          )}
        </div>

        {/* Qty */}
        <Input
          type="number"
          min={0}
          step="any"
          value={line.qty}
          onChange={(e) => onUpdate(index, { qty: Number(e.target.value) })}
          className="h-8 text-right text-sm"
          disabled={isDiscount}
        />

        {/* Rate */}
        <Input
          type="number"
          min={0}
          step="any"
          value={line.rate}
          onChange={(e) => onUpdate(index, { rate: Number(e.target.value) })}
          className="h-8 text-right text-sm"
        />

        {/* Discount */}
        <div className="flex gap-0.5">
          <Input
            type="number"
            min={0}
            step="any"
            value={line.discount}
            onChange={(e) => onUpdate(index, { discount: Number(e.target.value) })}
            className="h-8 w-full text-right text-sm"
            disabled={isDiscount}
          />
          <button
            type="button"
            onClick={() =>
              onUpdate(index, { discountIsPercentage: !line.discountIsPercentage })
            }
            className="h-8 rounded border px-1 text-xs hover:bg-muted"
            title={line.discountIsPercentage ? "Switch to fixed" : "Switch to %"}
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
            onUpdate(index, {
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
              onClick={() => onToggleTax(index, tax.id)}
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
          onClick={() => onRemove(index)}
          className="mt-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Mobile card layout ── */}
      <div className="sm:hidden p-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab text-muted-foreground touch-none p-1"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Input
            placeholder="Item name"
            value={line.name}
            onChange={(e) => onUpdate(index, { name: e.target.value })}
            className="flex-1 h-10"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="p-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <Select
            value={line.lineType}
            onValueChange={(v: string) => onUpdate(index, { lineType: v as LineType })}
          >
            <SelectTrigger className="h-10 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-sm">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onToggleDescription(index)}
            className="p-2 text-muted-foreground hover:text-foreground"
            title="Toggle description"
          >
            {expandedDescriptions.has(index) ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {expandedDescriptions.has(index) && (
          <Textarea
            placeholder="Description (optional)"
            value={line.description ?? ""}
            onChange={(e) => onUpdate(index, { description: e.target.value })}
            className="min-h-[56px] text-sm text-muted-foreground resize-y"
            rows={2}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Qty</label>
            <Input
              type="number"
              min={0}
              step="any"
              value={line.qty}
              onChange={(e) => onUpdate(index, { qty: Number(e.target.value) })}
              className="h-10 text-right"
              disabled={isDiscount}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rate</label>
            <Input
              type="number"
              min={0}
              step="any"
              value={line.rate}
              onChange={(e) => onUpdate(index, { rate: Number(e.target.value) })}
              className="h-10 text-right"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Discount</label>
            <div className="flex gap-0.5">
              <Input
                type="number"
                min={0}
                step="any"
                value={line.discount}
                onChange={(e) => onUpdate(index, { discount: Number(e.target.value) })}
                className="h-10 w-full text-right"
                disabled={isDiscount}
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate(index, { discountIsPercentage: !line.discountIsPercentage })
                }
                className="h-10 rounded border px-2 text-sm hover:bg-muted"
                title={line.discountIsPercentage ? "Switch to fixed" : "Switch to %"}
                disabled={isDiscount}
              >
                {line.discountIsPercentage ? "%" : "$"}
              </button>
            </div>
          </div>
          {showPeriod && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={line.period ?? ""}
                onChange={(e) =>
                  onUpdate(index, {
                    period: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="h-10 text-right"
                placeholder="1"
              />
            </div>
          )}
        </div>

        {taxes.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Taxes</label>
            <div className="flex flex-wrap gap-1.5">
              {taxes.map((tax) => (
                <button
                  key={tax.id}
                  type="button"
                  onClick={() => onToggleTax(index, tax.id)}
                  className={`rounded px-2 py-1.5 text-xs border transition-colors ${
                    line.taxIds.includes(tax.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {tax.name} {tax.rate}%
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-sm text-muted-foreground">Total</span>
          <div className="text-right">
            <span className="text-sm font-semibold">{fmt(result.total, currencySymbol)}</span>
            {result.taxTotal > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                (tax: {fmt(result.taxTotal, currencySymbol)})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function LineItemEditor({ lines, taxes, currencySymbol, onChange }: Props) {
  const [expandedDescriptions, setExpandedDescriptions] = React.useState<Set<number>>(
    new Set()
  );
  // Monotonically increasing counter ensures unique sort keys even after deletes
  const sortCounter = useRef(lines.length);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function updateLine(index: number, patch: Partial<LineItemValue>) {
    const updated = lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(updated);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function addLine() {
    onChange([...lines, newLine(sortCounter.current++)]);
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lines.findIndex((l) => l.sort === active.id);
    const newIndex = lines.findIndex((l) => l.sort === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...lines];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onChange(reordered.map((l, i) => ({ ...l, sort: i })));
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="hidden sm:grid grid-cols-[24px_2fr_80px_120px_80px_80px_120px_100px_32px] gap-2 px-2 text-xs font-medium text-muted-foreground">
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={lines.map((l) => l.sort)}
          strategy={verticalListSortingStrategy}
        >
          {lines.map((line, i) => (
            <SortableLineItem
              key={line.sort}
              line={line}
              index={i}
              taxes={taxes}
              currencySymbol={currencySymbol}
              expandedDescriptions={expandedDescriptions}
              onUpdate={updateLine}
              onRemove={removeLine}
              onToggleDescription={toggleDescription}
              onToggleTax={toggleTax}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        + Add Line Item
      </Button>
    </div>
  );
}
