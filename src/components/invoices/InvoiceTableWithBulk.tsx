"use client";

import React from "react";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InvoiceRowActions } from "@/components/invoices/InvoiceRowActions";
import type { InvoiceStatus, InvoiceType } from "@/generated/prisma";
import { INVOICE_STATUS_BADGE as STATUS_BADGE, INVOICE_TYPE_LABELS as TYPE_LABELS } from "@/lib/invoice-ui";
import { Archive, Trash2, RefreshCw, Send, CheckCircle } from "lucide-react";

type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  type: InvoiceType;
  date: string | null;
  total: number;
  currency: { symbol: string; symbolPosition: string; code?: string };
  client: { name: string };
  recurringInvoice?: { isActive: boolean; frequency: string } | null;
};

type Props = {
  invoices: Invoice[];
};


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

const PROBABILITY_BAND: Record<string, { className: string; title: string }> = {
  high: { className: "bg-success/10 text-success-foreground", title: "Likely to pay" },
  medium: { className: "bg-warning/12 text-warning-foreground", title: "Payment uncertain" },
  low: { className: "bg-danger/10 text-danger-foreground", title: "At risk of late/non-payment" },
};

type RowProps = {
  inv: Invoice;
  isSelected: boolean;
  onToggle: (id: string) => void;
  probability?: { percent: number; band: string };
};

const InvoiceRow = React.memo(function InvoiceRow({ inv, isSelected, onToggle, probability }: RowProps) {
  const badge = STATUS_BADGE[inv.status];
  const probBand = probability ? PROBABILITY_BAND[probability.band] : undefined;
  const isDraft = inv.status === "DRAFT";
  return (
    <tr
      className={cn("group", isSelected && "bg-accent/40")}
      // Overdue rows carry a faint red wash so the queue reads at a glance
      data-attention={inv.status === "OVERDUE" ? "true" : undefined}
    >
      <td className="print:hidden">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(inv.id)}
          className="rounded border-border"
          aria-label={`Select invoice ${inv.number}`}
        />
      </td>
      <td className={cn("font-medium", isDraft && "text-muted-foreground")}>
        <span className="inline-flex items-center gap-1.5">
          {isDraft ? TYPE_LABELS[inv.type] : inv.number}
          {inv.recurringInvoice?.isActive && (
            <span
              className="inline-flex items-center gap-0.5 font-mono text-[9px] font-normal text-muted-foreground"
              title={`Recurring · ${inv.recurringInvoice.frequency.charAt(0) + inv.recurringInvoice.frequency.slice(1).toLowerCase()}`}
            >
              <RefreshCw className="size-2.5" />
              {inv.recurringInvoice.frequency.toLowerCase()}
            </span>
          )}
        </span>
      </td>
      <td className={cn(isDraft && "text-muted-foreground")}>
        {inv.client.name}
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-[11px] py-[3px] text-[10px] font-medium tracking-[0.5px]",
              badge.className,
            )}
          >
            {badge.label}
          </span>
          {probability && probBand && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-medium tabular-nums",
                probBand.className,
              )}
              title={`Payment probability: ${probability.percent}% — ${probBand.title}`}
            >
              {probability.percent}%
            </span>
          )}
        </div>
      </td>
      <td className="font-mono text-[11px] text-muted-foreground">
        {formatDate(inv.date)}
      </td>
      <td
        className={cn(
          "text-right font-semibold tabular-nums",
          isDraft && "text-muted-foreground",
        )}
      >
        {formatCurrency(inv.total, inv.currency.symbol, inv.currency.symbolPosition, inv.currency.code)}
      </td>
      <td className="text-right print:hidden">
        <InvoiceRowActions
          invoiceId={inv.id}
          invoiceTotal={inv.total}
          status={inv.status}
          invoiceType={inv.type}
        />
      </td>
    </tr>
  );
});

export function InvoiceTableWithBulk({ invoices }: Props) {
  const allIds = invoices.map((i) => i.id);
  const { selected, selectedIds, allSelected, someSelected, toggle, toggleAll, clear } = useBulkSelection(allIds);
  const router = useRouter();
  const utils = trpc.useUtils();

  function onBulkComplete() {
    clear();
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

  // Payment-probability badges: fetched once for the org and looked up per row.
  // Open invoices only appear in the map, so paid/draft rows simply show no badge.
  // staleTime keeps this org-wide scan from refetching on every list interaction;
  // a future optimization could fold the score into the list query itself.
  const { data: probabilityData } = trpc.analytics.paymentProbability.useQuery(undefined, {
    staleTime: 60_000,
  });

  const isLoading = archiveMany.isPending || deleteMany.isPending || sendMany.isPending || markPaidMany.isPending;

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
              onClick={clear}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8 print:hidden">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-border"
                aria-label="Select all"
              />
            </th>
            <th>Invoice</th>
            <th>Client</th>
            <th>Status</th>
            <th>Due</th>
            <th className="text-right">Amount</th>
            <th className="print:hidden" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const prob = probabilityData?.byInvoiceId[inv.id];
            return (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                isSelected={selected.has(inv.id)}
                onToggle={toggle}
                probability={
                  prob
                    ? { percent: prob.paymentProbabilityPercent, band: prob.paymentProbabilityBand }
                    : undefined
                }
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
