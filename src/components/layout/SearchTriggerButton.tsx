"use client";

import { Search } from "lucide-react";

// Lives in its own module (not CommandPalette.tsx) so the dashboard layout can
// import this small button statically without pulling the cmdk + Radix Dialog
// chunk into every route's entry JS. The palette itself is loaded lazily via
// CommandPaletteLazy; the synthetic Cmd+K below reaches its listener once that
// chunk has mounted.
export function SearchTriggerButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Synthesize a Cmd+K so the palette's existing listener handles
        // the toggle. metaKey covers macOS; ctrlKey covers everywhere else,
        // and the listener accepts either.
        const event = new KeyboardEvent("keydown", {
          key: "k",
          metaKey: navigator.platform.toLowerCase().includes("mac"),
          ctrlKey: !navigator.platform.toLowerCase().includes("mac"),
          bubbles: true,
        });
        document.dispatchEvent(event);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label="Open search"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}
