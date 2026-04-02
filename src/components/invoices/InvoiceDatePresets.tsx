"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

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
        dateFrom: toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
        dateTo: toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
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
        dateFrom: toLocalDateStr(new Date(y, m, 1)),
        dateTo: toLocalDateStr(new Date(y, m + 1, 0)),
      };
    },
  },
  {
    label: "This Year",
    getValue: () => {
      const y = new Date().getFullYear();
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    },
  },
  {
    label: "Last Year",
    getValue: () => {
      const y = new Date().getFullYear() - 1;
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    getValue: () => ({ dateFrom: "", dateTo: "" }),
  },
];

export function InvoiceDatePresets() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(values: { dateFrom: string; dateTo: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.dateFrom) params.set("dateFrom", values.dateFrom);
    else params.delete("dateFrom");
    if (values.dateTo) params.set("dateTo", values.dateTo);
    else params.delete("dateTo");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 print:hidden">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => apply(p.getValue())}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
