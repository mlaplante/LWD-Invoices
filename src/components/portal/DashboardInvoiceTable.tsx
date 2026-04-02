"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type InvoiceRow = {
  id: string;
  number: string;
  status: string;
  date: string;
  dueDate: string | null;
  total: string;
  amountPaid: string;
  portalToken: string;
  currency: { symbol: string; symbolPosition: string };
};

type Props = {
  invoices: InvoiceRow[];
};

const STATUS_BADGE: Record<string, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",      dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",     dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",       dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",         dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",     dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",      dot: "bg-gray-300" },
};

type FilterKey = "all" | "unpaid" | "paid" | "overdue";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
];

function matchesFilter(status: string, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "unpaid") return ["SENT", "PARTIALLY_PAID"].includes(status);
  if (filter === "paid") return status === "PAID";
  if (filter === "overdue") return status === "OVERDUE";
  return true;
}


function computeBalance(total: string, amountPaid: string): number {
  return parseFloat(total) - parseFloat(amountPaid);
}

function fmt(n: number, sym: string, pos: string): string {
  const val = n.toFixed(2);
  return pos === "before" ? `${sym}${val}` : `${val}${sym}`;
}

export function DashboardInvoiceTable({ invoices }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = invoices.filter((inv) => matchesFilter(inv.status, filter));

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Filter buttons */}
      <div className="flex gap-1 p-4 pb-0">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter(f.key)}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 font-semibold">Invoice</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold">Date</th>
              <th className="pb-3 font-semibold">Due</th>
              <th className="pb-3 text-right font-semibold">Total</th>
              <th className="pb-3 text-right font-semibold">Balance</th>
              <th className="pb-3 text-right font-semibold">
                <span className="sr-only">View</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No invoices found.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.DRAFT;
                const balance = computeBalance(inv.total, inv.amountPaid);
                const sym = inv.currency.symbol;
                const pos = inv.currency.symbolPosition;

                return (
                  <tr
                    key={inv.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-3.5 font-medium text-foreground">
                      #{inv.number}
                    </td>
                    <td className="py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                          badge.className
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            badge.dot
                          )}
                        />
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3.5 text-muted-foreground">
                      {formatDate(inv.date)}
                    </td>
                    <td className="py-3.5 text-muted-foreground">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="py-3.5 text-right font-medium text-foreground">
                      {fmt(parseFloat(inv.total), sym, pos)}
                    </td>
                    <td
                      className={cn(
                        "py-3.5 text-right font-medium",
                        balance > 0
                          ? "text-amber-600"
                          : "text-foreground"
                      )}
                    >
                      {fmt(balance, sym, pos)}
                    </td>
                    <td className="py-3.5 text-right">
                      <a
                        href={`/portal/${inv.portalToken}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden p-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No invoices found.
          </p>
        ) : (
          filtered.map((inv) => {
            const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.DRAFT;
            const balance = computeBalance(inv.total, inv.amountPaid);
            const sym = inv.currency.symbol;
            const pos = inv.currency.symbolPosition;

            return (
              <a
                key={inv.id}
                href={`/portal/${inv.portalToken}`}
                className="block rounded-xl border border-border/50 p-4 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">
                    #{inv.number}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium",
                      badge.className
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        badge.dot
                      )}
                    />
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(inv.date)}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      balance > 0 ? "text-amber-600" : "text-foreground"
                    )}
                  >
                    {fmt(balance, sym, pos)}
                  </span>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
