"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// The editor dialog carries the whole dnd-kit runtime, but drag-and-drop only
// happens after "Edit layout" is clicked — so the chunk is fetched on first
// open instead of shipping in the dashboard's initial bundle.
const LayoutEditorDialog = dynamic(
  () => import("./LayoutEditorDialog").then((m) => m.LayoutEditorDialog),
  { ssr: false },
);

export function DashboardLayoutEditor({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  // Mount on first open, then keep mounted so reopening is instant and dialog
  // state transitions stay smooth.
  const [everOpened, setEverOpened] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
        className="gap-2"
      >
        <Settings className="h-4 w-4" />
        Edit layout
      </Button>

      {everOpened && (
        <LayoutEditorDialog open={open} onOpenChange={setOpen} onSaved={onSaved} />
      )}
    </>
  );
}
