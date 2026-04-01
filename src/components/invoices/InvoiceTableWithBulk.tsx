"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InvoiceRowActions } from "@/components/invoices/InvoiceRowActions";
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

type Props = {
  invoices: Invoice[];
};

function fmt(n: number, symbol: string, pos: string): string {
  return pos === "before" ? `${symbol}${n.toFixed(2)}` : `${n.toFixed(2)}${symbol}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatBulkResult(
  action: string,
  result: { succeeded: number; failed: number; skipped: number; errors: string[] }
): { message: string; isError: boolean } {
  if (result.failed === 0 && result.skipped === 0) {
    return {
      message: `${result.succeeded} invoice${result.succeeded !== 1 ? "s" : ""} ${action}`,
      isError: false,
    };
  }
  const parts: string[] = [];
  if (result.succeeded > 0) parts.push(`${result.succeeded} ${action}`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return { message: parts.join(", "), isError: result.failed > 0 };
}

export function InvoiceTableWithBulk({ invoices }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  const utils = trpc.useUtils();

  function onBulkComplete() {
    setSelected(new Set());
    router.refresh();
    void utils.invoices.list.invalidate();
  }

  const archiveMany = trpc.invoices.archiveMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} archived`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMany = trpc.invoices.deleteMany.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} invoice${result.count !== 1 ? "s" : ""} deleted`);
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendMany = trpc.invoices.sendMany.useMutation({
    onSuccess: (result) => {
      const { message, isError } = formatBulkResult("sent", {
        succeeded: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      });
      if (isError) {
        toast.error(message);
      } else {
        toast.success(message);
      }
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMany = trpc.invoices.markPaidMany.useMutation({
    onSuccess: (result) => {
      const { message, isError } = formatBulkResult("marked paid", {
        succeeded: result.paid,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      });
      if (isError) {
        toast.error(message);
      } else {
        toast.success(message);
      }
      onBulkComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const allIds = invoices.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const isLoading = archiveMany.isPending || deleteMany.isPending || sendMany.isPending || markPaidMany.isPending;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedIds = Array.from(selected);

  // Determine which bulk actions make sense for the selection
  const selectedInvoices = invoices.filter((i) => selected.has(i.id));
  const hasSendable = selectedInvoices.some((i) => i.status === "DRAFT");
  const hasPayable = selectedInvoices.some(
    (i) => i.status === "SENT" || i.status === "PARTIALLY_PAID" || i.status === "OVERDUE"
  );

  return (
    <div className="space-y-3">
      {/* Floating bulk action bar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg print:hidden">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            {hasSendable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={isLoading}
                onClick={() => sendMany.mutate({ ids: selectedIds })}
              >
                <Send className="w-3.5 h-3.5" />
                Send ({selectedInvoices.filter((i) => i.status === "DRAFT").length})
              </Button>
            )}
            {hasPayable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                disabled={isLoading}
                onClick={() => markPaidMany.mutate({ ids: selectedIds })}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Mark Paid ({selectedInvoices.filter((i) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => archiveMany.mutate({ ids: selectedIds, isArchived: true })}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => deleteMany.mutate({ ids: selectedIds })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selected.size})
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
            <th className="pb-3 pl-2 w-8 print:hidden">
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
            <th className="pb-3 print:hidden" />
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
                <td className="py-3.5 pl-2 print:hidden">
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
                      <p className="font-semibold text-foreground leading-tight flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">#{inv.number}</span>
                        {TYPE_LABELS[inv.type]}
                        {inv.recurringInvoice?.isActive && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-md px-1.5 py-0.5"
                            title={`Recurring \u00b7 ${inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            {inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}
                          </span>
                        )}
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
                <td className="py-3.5 text-right font-mono font-semibold tabular-nums text-foreground">
                  {fmt(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                </td>
                <td className="py-3.5 pl-4">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium", badge.className)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.dot)} />
                    {badge.label}
                  </span>
                </td>
                <td className="py-3.5 pr-2 print:hidden">
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
