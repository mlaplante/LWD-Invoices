"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Props = {
  basePath: string;
  from?: string;
  to?: string;
  children?: React.ReactNode; // slot for extra filters (e.g. category dropdown)
};

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PRESETS = [
  {
    label: "This Month",
    getValue: () => {
      const now = new Date();
      return {
        from: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "Last Month",
    getValue: () => {
      const now = new Date();
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      return {
        from: toLocalDateStr(new Date(y, m, 1)),
        to: toLocalDateStr(new Date(y, m + 1, 0)),
      };
    },
  },
  {
    label: "This Year",
    getValue: () => {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "Last Year",
    getValue: () => {
      const y = new Date().getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    getValue: () => ({ from: "", to: "" }),
  },
];

export function ReportFilters({ basePath, from = "", to = "", children }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex items-center gap-1.5">
        <label htmlFor="filter-from" className="text-xs text-muted-foreground font-medium">From</label>
        <input
          id="filter-from"
          type="date"
          value={from}
          onChange={(e) => updateParams({ from: e.target.value })}
          className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label htmlFor="filter-to" className="text-xs text-muted-foreground font-medium">To</label>
        <input
          id="filter-to"
          type="date"
          value={to}
          onChange={(e) => updateParams({ to: e.target.value })}
          className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => updateParams(p.getValue())}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
