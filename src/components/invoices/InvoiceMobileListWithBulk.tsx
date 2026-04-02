"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { FileText, Archive, Trash2, RefreshCw, Send, CheckCircle } from "lucide-react";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; dot: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  SENT:           { label: "Unpaid",   className: "bg-amber-50 text-amber-600",      dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600",        dot: "bg-blue-500" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600",  dot: "bg-emerald-500" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600",          dot: "bg-red-500" },
  ACCEPTED:       { label: "Accepted", className: "bg-primary/10 text-primary",      dot: "bg-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400",       dot: "bg-gray-300" },
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
  date: string | null;
  total: number;
  currency: { symbol: string; symbolPosition: string };
  client: { name: string };
  recurringInvoice?: { isActive: boolean; frequency: string } | null;
};


export function InvoiceMobileListWithBulk({ invoices }: { invoices: Invoice[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const router = useRouter();
  const utils = trpc.useUtils();

  function onBulkComplete() {
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
    void utils.invoices.list.invalidate();
  }

  const archiveMany = trpc.invoices.archiveMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} archived`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMany = trpc.invoices.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} deleted`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendMany = trpc.invoices.sendMany.useMutation({
    onSuccess: (result) => {
      const msg = result.failed > 0
        ? `${result.sent} sent, ${result.failed} failed`
        : `${result.sent} sent`;
      result.failed > 0 ? toast.error(msg) : toast.success(msg);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMany = trpc.invoices.markPaidMany.useMutation({
    onSuccess: (result) => {
      const msg = result.failed > 0
        ? `${result.paid} marked paid, ${result.failed} failed`
        : `${result.paid} marked paid`;
      result.failed > 0 ? toast.error(msg) : toast.success(msg);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = archiveMany.isPending || deleteMany.isPending || sendMany.isPending || markPaidMany.isPending;
  const someSelected = selected.size > 0;
  const selectedIds = Array.from(selected);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (next.size === 0) setSelectMode(false);
  }

  return (
    <div className="sm:hidden print:hidden">
      {/* Toggle select mode */}
      {!selectMode && invoices.length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground mb-2 underline"
          onClick={() => setSelectMode(true)}
        >
          Select
        </button>
      )}

      {/* Floating action bar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg mb-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => sendMany.mutate({ ids: selectedIds })}>
              <Send className="w-3 h-3" /> Send
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => markPaidMany.mutate({ ids: selectedIds })}>
              <CheckCircle className="w-3 h-3" /> Paid
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => archiveMany.mutate({ ids: selectedIds, isArchived: true })}>
              <Archive className="w-3 h-3" /> Archive
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={isLoading}
              onClick={() => deleteMany.mutate({ ids: selectedIds })}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => { setSelected(new Set()); setSelectMode(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Card list */}
      <div className="divide-y divide-border/50">
        {invoices.map((inv) => {
          const badge = STATUS_BADGE[inv.status];
          const isSelected = selected.has(inv.id);

          return (
            <div
              key={inv.id}
              className={cn(
                "flex items-center gap-3 py-3.5 px-2 transition-colors",
                isSelected && "bg-accent/20",
                !selectMode && "hover:bg-accent/30"
              )}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(inv.id)}
                  className="rounded border-border shrink-0"
                  aria-label={`Select invoice ${inv.number}`}
                />
              )}
              <Link
                href={selectMode ? "#" : `/invoices/${inv.id}`}
                onClick={(e) => {
                  if (selectMode) {
                    e.preventDefault();
                    toggle(inv.id);
                  }
                }}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                    <span className="truncate">{TYPE_LABELS[inv.type]} #{inv.number}</span>
                    {inv.recurringInvoice?.isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-md px-1.5 py-0.5 shrink-0">
                        <RefreshCw className="w-2.5 h-2.5" />
                        {inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {inv.client.name} &middot; {formatDate(inv.date)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-semibold text-sm">
                    {formatCurrency(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", badge.className)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                    {badge.label}
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
