"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";

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
            className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Bottom sheet on mobile, anchored dropdown from sm: up */}
          <div className="fixed inset-x-3 bottom-3 z-50 flex max-h-[70dvh] flex-col gap-1.5 overflow-y-auto rounded-2xl border border-border/70 bg-popover p-3 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(70vh,28rem)] sm:w-64 sm:rounded-xl sm:p-2 sm:shadow-lg [&>*]:w-full [&_button]:w-full [&_button]:justify-start [&_a]:w-full [&_a]:justify-start">
            <div className="mb-1 flex items-center justify-between sm:hidden">
              <span className="text-sm font-semibold">More actions</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="!w-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
