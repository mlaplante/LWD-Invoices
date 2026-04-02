"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent/30 transition-colors print:hidden"
    >
      <Printer className="w-3.5 h-3.5" />
      Print / Save PDF
    </button>
  );
}
