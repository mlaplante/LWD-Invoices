"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InvoiceRowActions } from "@/components/invoices/InvoiceRowActions";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { FileText, Archive, Trash2 } from "lucide-react";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600" },
  PAID:           { label: "Paid",     className: "bg-primary/10 text-primary" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600" },
  ACCEPTED:       { label: "Accepted", className: "bg-emerald-50 text-emerald-600" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-500" },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  DETAILED: "Invoice",
  SIMPLE:   "Invoice",
  ESTIMATE: "Estimate",
  CREDIT_NOTE: "Credit Note",
};

type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  type: InvoiceType;
  date: Date | null;
  total: number;
  currency: { symbol: string; symbolPosition: string };
  client: { name: string };
};

type Props = {
  invoices: Invoice[];
};

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function InvoiceTableWithBulk({ invoices }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  const utils = trpc.useUtils();

  const archiveMany = trpc.invoices.archiveMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} archived`);
      setSelected(new Set());
      router.refresh();
      void utils.invoices.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMany = trpc.invoices.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} deleted`);
      setSelected(new Set());
      router.refresh();
      void utils.invoices.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const allIds = invoices.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-accent/50 border border-border/50">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              disabled={archiveMany.isPending}
              onClick={() => archiveMany.mutate({ ids: selectedIds, isArchived: true })}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5"
              disabled={deleteMany.isPending}
              onClick={() => deleteMany.mutate({ ids: selectedIds })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-3 pl-2 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-border"
                aria-label="Select all"
              />
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Invoice
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Date
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Client
            </th>
            <th className="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Amount
            </th>
            <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide pl-4">
              Status
            </th>
            <th className="pb-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {invoices.map((inv) => {
            const badge = STATUS_BADGE[inv.status];
            const isSelected = selected.has(inv.id);
            return (
              <tr
                key={inv.id}
                className={cn(
                  "group hover:bg-accent/30 transition-colors",
                  isSelected && "bg-accent/20"
                )}
              >
                <td className="py-3.5 pl-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(inv.id)}
                    className="rounded border-border"
                    aria-label={`Select invoice ${inv.number}`}
                  />
                </td>
                <td className="py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground leading-tight">
                        {TYPE_LABELS[inv.type]} #{inv.number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inv.client.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 text-muted-foreground">
                  {formatDate(inv.date)}
                </td>
                <td className="py-3.5 text-foreground/80">
                  {inv.client.name}
                </td>
                <td className="py-3.5 text-right font-semibold text-foreground">
                  {fmt(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                </td>
                <td className="py-3.5 pl-4">
                  <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold", badge.className)}>
                    {badge.label}
                  </span>
                </td>
                <td className="py-3.5 pr-2">
                  <InvoiceRowActions
                    invoiceId={inv.id}
                    invoiceTotal={inv.total}
                    status={inv.status}
                    invoiceType={inv.type}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
