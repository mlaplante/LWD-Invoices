"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { nextFocusOnEnter, duplicateRowAt } from "../line-item-keyboard";
import { newLine, computeLineResult, type TaxOption } from "../line-item-utils";
import { LINE_TYPE_LABELS, type LineItemValue } from "../LineItemEditor";
import { EditableText, EditableNumber } from "./editable";
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

type Props = {
  lines: LineItemValue[];
  taxes: TaxOption[];
  currencySymbol: string;
  fmt: (n: number) => string;
  readOnly?: boolean;
  onChange: (lines: LineItemValue[]) => void;
};

const PERIOD_TYPES: LineType[] = [
  LineType.PERIOD_DAY,
  LineType.PERIOD_WEEK,
  LineType.PERIOD_MONTH,
  LineType.PERIOD_YEAR,
];

function isPeriodType(lineType: LineType): boolean {
  return PERIOD_TYPES.includes(lineType);
}

function isDiscountType(lineType: LineType): boolean {
  return lineType === LineType.PERCENTAGE_DISCOUNT || lineType === LineType.FIXED_DISCOUNT;
}

/** Muted one-line summary of a row's secondary attributes, e.g. "10% off · GST 10%". */
function buildSummary(line: LineItemValue, taxes: TaxOption[], currencySymbol: string): string {
  const parts: string[] = [];
  if (line.discount > 0) {
    parts.push(
      line.discountIsPercentage
        ? `${line.discount}% off`
        : `${currencySymbol}${line.discount} off`
    );
  }
  for (const tax of taxes) {
    if (line.taxIds.includes(tax.id)) parts.push(`${tax.name} ${tax.rate}%`);
  }
  return parts.join(" · ");
}

// ── Row ──────────────────────────────────────────────────────────────────────

type RowProps = {
  line: LineItemValue;
  index: number;
  taxes: TaxOption[];
  currencySymbol: string;
  fmt: (n: number) => string;
  readOnly: boolean;
  onUpdate: (index: number, patch: Partial<LineItemValue>) => void;
  onRemove: (index: number) => void;
  onToggleTax: (index: number, taxId: string) => void;
  onEnter: (index: number) => void;
  onDuplicate: (index: number) => void;
  registerFirstInput: (index: number, el: HTMLDivElement | null) => void;
};

function CanvasLineRowImpl({
  line,
  index,
  taxes,
  currencySymbol,
  fmt,
  readOnly,
  onUpdate,
  onRemove,
  onToggleTax,
  onEnter,
  onDuplicate,
  registerFirstInput,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: line.sort });
  const [descriptionVisible, setDescriptionVisible] = useState(Boolean(line.description));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const result = computeLineResult(line, taxes);
  const discount = isDiscountType(line.lineType);
  const period = isPeriodType(line.lineType);
  const summary = buildSummary(line, taxes, currencySymbol);

  // EditableText's own onKeyDown preventDefaults Enter but does not stop
  // propagation, so this wrapper can intercept the bubbled event to drive
  // row navigation/duplication — without adding params to EditableText's props.
  function handleNameKeyDown(e: React.KeyboardEvent) {
    const isField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (!isField) return;
    if (e.key === "Enter" && !e.shiftKey) {
      onEnter(index);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
      e.preventDefault();
      onDuplicate(index);
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative flex items-start gap-1 py-1">
      {!readOnly && (
        <button
          type="button"
          className="mt-1.5 h-4 w-4 shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <div className="grid flex-1 grid-cols-[1fr_90px_110px_110px_32px] items-start gap-2">
        {/* Description */}
        <div className="min-w-0">
          {readOnly ? (
            <div className="text-sm">
              {line.name || <span className="text-muted-foreground">—</span>}
            </div>
          ) : (
            <div ref={(el) => registerFirstInput(index, el)} onKeyDown={handleNameKeyDown}>
              <EditableText
                value={line.name}
                onCommit={(v) => onUpdate(index, { name: v })}
                placeholder="Item name"
                ariaLabel={`Line ${index + 1} name`}
                className="w-full text-sm font-medium"
              />
            </div>
          )}
          {summary && <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>}
          {descriptionVisible &&
            (readOnly ? (
              line.description && (
                <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {line.description}
                </div>
              )
            ) : (
              <EditableText
                value={line.description ?? ""}
                onCommit={(v) => onUpdate(index, { description: v })}
                multiline
                placeholder="Description"
                ariaLabel={`Line ${index + 1} description`}
                className="mt-0.5 w-full text-xs text-muted-foreground"
              />
            ))}
        </div>

        {/* Qty */}
        <div>
          {readOnly ? (
            <div className="text-right text-sm tabular-nums">{String(line.qty)}</div>
          ) : (
            <EditableNumber
              value={line.qty}
              onCommit={(v) => onUpdate(index, { qty: v })}
              format={(n) => String(n)}
              ariaLabel={`Line ${index + 1} quantity`}
              className="w-full text-sm"
              disabled={discount}
            />
          )}
        </div>

        {/* Rate */}
        <div>
          {readOnly ? (
            <div className="text-right text-sm tabular-nums">{fmt(line.rate)}</div>
          ) : (
            <EditableNumber
              value={line.rate}
              onCommit={(v) => onUpdate(index, { rate: v })}
              format={fmt}
              ariaLabel={`Line ${index + 1} rate`}
              className="w-full text-sm"
              disabled={discount}
            />
          )}
        </div>

        {/* Amount — always computed, never editable */}
        <div className="text-right text-sm font-medium tabular-nums">{fmt(result.total)}</div>

        {/* Row actions */}
        {!readOnly && (
          <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`More options for line ${index + 1}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Line type</label>
                  <Select
                    value={line.lineType}
                    onValueChange={(v: string) => onUpdate(index, { lineType: v as LineType })}
                  >
                    <SelectTrigger className="h-8 text-xs">
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
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Discount</label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.discount}
                      onChange={(e) => onUpdate(index, { discount: Number(e.target.value) })}
                      className="h-8 text-right text-sm"
                      disabled={discount}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(index, { discountIsPercentage: !line.discountIsPercentage })
                      }
                      className="h-8 rounded border px-2 text-xs hover:bg-muted"
                      title={line.discountIsPercentage ? "Switch to fixed" : "Switch to %"}
                      disabled={discount}
                    >
                      {line.discountIsPercentage ? "%" : currencySymbol}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Period</label>
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
                    disabled={!period}
                    placeholder={period ? "1" : "—"}
                  />
                </div>

                {taxes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Taxes</label>
                    <div className="flex flex-wrap gap-1">
                      {taxes.map((tax) => (
                        <button
                          key={tax.id}
                          type="button"
                          onClick={() => onToggleTax(index, tax.id)}
                          className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${
                            line.taxIds.includes(tax.id)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {tax.name} {tax.rate}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!descriptionVisible && (
                  <button
                    type="button"
                    onClick={() => setDescriptionVisible(true)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    + Add description
                  </button>
                )}

                <div className="border-t pt-2">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete line
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
}

const CanvasLineRow = React.memo(CanvasLineRowImpl);

// ── Main ─────────────────────────────────────────────────────────────────────

export function CanvasLineRows({
  lines,
  taxes,
  currencySymbol,
  fmt,
  readOnly = false,
  onChange,
}: Props) {
  // Monotonically increasing counter ensures unique sort keys even after deletes
  const sortCounter = useRef(lines.length);

  // Ref map for focus management: maps array-index → wrapper div around the
  // row's name EditableText. Focusing the wrapper's inner button/input drives
  // EditableText into edit mode (its DisplayButton activates onFocus) and the
  // subsequent autoFocus'd <input> receives real keyboard focus.
  const firstInputRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  // Track which row index should receive focus after next render
  const pendingFocusRow = useRef<number | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  // Refs for stable callbacks: row callbacks capture latest props without
  // changing identity, so memoized rows skip re-render when neighbors update.
  const linesRef = useRef(lines);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    linesRef.current = lines;
    onChangeRef.current = onChange;
  }, [lines, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateLine = useCallback((index: number, patch: Partial<LineItemValue>) => {
    const current = linesRef.current;
    onChangeRef.current(current.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((index: number) => {
    onChangeRef.current(linesRef.current.filter((_, i) => i !== index));
  }, []);

  const toggleTax = useCallback((index: number, taxId: string) => {
    const line = linesRef.current[index];
    const taxIds = line.taxIds.includes(taxId)
      ? line.taxIds.filter((id) => id !== taxId)
      : [...line.taxIds, taxId];
    onChangeRef.current(linesRef.current.map((l, i) => (i === index ? { ...l, taxIds } : l)));
  }, []);

  const registerFirstInput = useCallback((index: number, el: HTMLDivElement | null) => {
    firstInputRefs.current.set(index, el);
  }, []);

  const handleEnter = useCallback((index: number) => {
    const decision = nextFocusOnEnter({ rowCount: linesRef.current.length, rowIndex: index });
    if (decision.action === "append") {
      onChangeRef.current([...linesRef.current, newLine(sortCounter.current++)]);
    }
    pendingFocusRow.current = decision.focusRow;
    setFocusTick((t) => t + 1);
  }, []);

  const handleDuplicate = useCallback((index: number) => {
    onChangeRef.current(duplicateRowAt(linesRef.current, index));
    pendingFocusRow.current = index + 1;
    setFocusTick((t) => t + 1);
  }, []);

  // After each focusTick, move focus to the pending row's name field
  useEffect(() => {
    if (pendingFocusRow.current !== null) {
      const container = firstInputRefs.current.get(pendingFocusRow.current);
      const target = container?.querySelector<HTMLElement>("input, textarea, button");
      target?.focus();
      pendingFocusRow.current = null;
    }
  }, [focusTick]);

  function addLine() {
    onChange([...lines, newLine(sortCounter.current++)]);
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
    <div className="space-y-0.5">
      {/* Header */}
      <div className="hidden gap-2 px-1 pl-5 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_90px_110px_110px_32px]">
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => {
              const pos = lines.findIndex((l) => l.sort === active.id) + 1;
              return `Picked up line item ${pos}.`;
            },
            onDragOver: ({ active, over }) => {
              if (!over) return "";
              const activePos = lines.findIndex((l) => l.sort === active.id) + 1;
              const overPos = lines.findIndex((l) => l.sort === over.id) + 1;
              return `Line item ${activePos} moved to position ${overPos}.`;
            },
            onDragEnd: ({ active, over }) => {
              const activePos = lines.findIndex((l) => l.sort === active.id) + 1;
              if (!over) return `Line item ${activePos} dropped.`;
              const overPos = lines.findIndex((l) => l.sort === over.id) + 1;
              return `Line item ${activePos} dropped at position ${overPos}.`;
            },
            onDragCancel: ({ active }) => {
              const pos = lines.findIndex((l) => l.sort === active.id) + 1;
              return `Reordering cancelled for line item ${pos}.`;
            },
          },
        }}
      >
        <SortableContext items={lines.map((l) => l.sort)} strategy={verticalListSortingStrategy}>
          {lines.map((line, i) => (
            <CanvasLineRow
              key={line.sort}
              line={line}
              index={i}
              taxes={taxes}
              currencySymbol={currencySymbol}
              fmt={fmt}
              readOnly={readOnly}
              onUpdate={updateLine}
              onRemove={removeLine}
              onToggleTax={toggleTax}
              onEnter={handleEnter}
              onDuplicate={handleDuplicate}
              registerFirstInput={registerFirstInput}
            />
          ))}
        </SortableContext>
      </DndContext>

      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addLine}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          + Add a line
        </Button>
      )}
    </div>
  );
}
