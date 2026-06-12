"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/**
 * Collapses secondary invoice actions behind a "More" toggle.
 *
 * Children are the existing self-contained action buttons (each owns its own
 * dialog/mutation), stacked vertically in an anchored panel. A plain toggled
 * panel is used instead of a Radix menu so child dialogs stay mounted while
 * open.
 */
export function MoreActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="w-3.5 h-3.5 mr-1.5" />
        More
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 ml-1.5 transition-transform",
            open && "rotate-180"
          )}
        />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-1.5 rounded-xl border border-border/70 bg-popover p-2 shadow-lg [&>*]:w-full [&_button]:w-full [&_button]:justify-start [&_a]:w-full [&_a]:justify-start">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
