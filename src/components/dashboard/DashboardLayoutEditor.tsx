"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { WIDGET_META } from "@/components/dashboard/widget-registry";
import type { LayoutEntry, WidgetKey } from "@/lib/dashboard-layout";
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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Sortable row ──────────────────────────────────────────────────────────────

function SortableRow({
  entry,
  onToggle,
}: {
  entry: LayoutEntry;
  onToggle: (key: WidgetKey) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors"
      aria-label={`${WIDGET_META[entry.key].label} — ${entry.visible ? "visible" : "hidden"}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-label={`Drag to reorder ${WIDGET_META[entry.key].label}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Visibility checkbox */}
      <input
        type="checkbox"
        id={`widget-toggle-${entry.key}`}
        checked={entry.visible}
        onChange={() => onToggle(entry.key)}
        className="h-4 w-4 rounded accent-primary cursor-pointer"
        aria-label={`Toggle visibility of ${WIDGET_META[entry.key].label}`}
      />

      <label
        htmlFor={`widget-toggle-${entry.key}`}
        className="flex-1 text-sm font-medium cursor-pointer select-none"
      >
        {WIDGET_META[entry.key].label}
      </label>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function DashboardLayoutEditor({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draftLayout, setDraftLayout] = useState<LayoutEntry[] | null>(null);

  const { data: savedLayout, isLoading } = trpc.dashboardLayout.get.useQuery(undefined, {
    enabled: open,
  });
  const layout = useMemo(() => draftLayout ?? savedLayout ?? [], [draftLayout, savedLayout]);

  const saveMutation = trpc.dashboardLayout.save.useMutation({
    onSuccess: () => {
      toast.success("Layout saved");
      setOpen(false);
      onSaved?.();
    },
    onError: () => {
      toast.error("Failed to save layout");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // aria-live announcer ref
  const announcerRef = useRef<HTMLDivElement>(null);
  function announce(msg: string) {
    if (announcerRef.current) announcerRef.current.textContent = msg;
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = layout.findIndex((e) => e.key === active.id);
        const newIndex = layout.findIndex((e) => e.key === over.id);
        const next = arrayMove(layout, oldIndex, newIndex);
        announce(
          `${WIDGET_META[active.id as WidgetKey].label} moved to position ${newIndex + 1}`,
        );
        setDraftLayout(next);
      }
    },
    [layout],
  );

  const handleToggle = useCallback((key: WidgetKey) => {
    setDraftLayout(layout.map((e) => (e.key === key ? { ...e, visible: !e.visible } : e)));
  }, [layout]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraftLayout(null);
  }, []);

  function handleSave() {
    saveMutation.mutate({ layout });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Settings className="h-4 w-4" />
        Edit layout
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize dashboard</DialogTitle>
          </DialogHeader>

          {/* aria-live announcer for keyboard DnD */}
          <div
            ref={announcerRef}
            role="status"
            aria-live="assertive"
            aria-atomic="true"
            className="sr-only"
          />

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={layout.map((e) => e.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2" role="list" aria-label="Dashboard widgets">
                  {layout.map((entry) => (
                    <SortableRow
                      key={entry.key}
                      entry={entry}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
            >
              Save layout
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
