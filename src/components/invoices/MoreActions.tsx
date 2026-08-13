"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";

/**
 * Labeled group of actions inside the MoreActions panel. Renders a two-column
 * grid on mobile so every action stays above the fold, and a vertical list in
 * the desktop dropdown.
 */
export function MoreActionsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-col sm:gap-1">
        {children}
      </div>
    </div>
  );
}

/**
 * Collapses secondary invoice actions behind a "More" toggle.
 *
 * Children are the existing self-contained action buttons (each owns its own
 * dialog/mutation), grouped with MoreActionsSection. A plain toggled panel is
 * used instead of a Radix menu so child dialogs stay mounted while open.
 *
 * Stacking: the panel must stay at z-50 or below — the child action dialogs
 * are Radix portals at z-50, and a higher panel z would paint over them. On
 * mobile the panel instead clears the h-16 bottom tab bar (also z-50) with a
 * bottom offset so the two never overlap.
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
          {/* Bottom sheet above the mobile tab bar; anchored dropdown from sm: up */}
          <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)] z-50 flex max-h-[70dvh] flex-col gap-3 overflow-y-auto rounded-[10px] border border-border/70 bg-popover p-3 pb-4 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(70vh,28rem)] sm:w-64 sm:gap-2 sm:rounded-xl sm:p-2 sm:pb-2 sm:shadow-lg [&_button]:w-full [&_button]:justify-start [&_button]:text-xs sm:[&_button]:text-sm [&_a]:w-full [&_a]:justify-start">
            <div className="flex items-center justify-between sm:hidden">
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
