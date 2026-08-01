"use client";

import React from "react";
import { InvoiceCanvas, type InvoiceCanvasProps } from "./InvoiceCanvas";

type Props = InvoiceCanvasProps & {
  /** Rendered in the right rail: create-from-prompt panel, payment schedule,
   * draft QA, reminder override, duplicate-invoice warning, Stripe Tax
   * preflight warning. Collapsible below `sm` via native details/summary so
   * it doesn't require extra state; forced open at `sm+` by hiding the
   * toggle. */
  sideRail: React.ReactNode;
};

export function InvoiceCanvasView({ sideRail, ...canvasProps }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <InvoiceCanvas {...canvasProps} />
      </div>
      <aside className="sm:border-l sm:pl-6">
        {/* Always-visible summary (not just sm:hidden) so a rail collapsed
            below `sm` still has a way to reopen after the viewport widens —
            a hidden toggle would otherwise strand the content closed. */}
        <details open>
          <summary className="mb-3 cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Details
          </summary>
          <div className="space-y-6">{sideRail}</div>
        </details>
      </aside>
    </div>
  );
}
