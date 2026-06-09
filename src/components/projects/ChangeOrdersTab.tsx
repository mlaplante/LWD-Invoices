"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/lib/format";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { InvoiceStatus } from "@/generated/prisma";
import { ChangeOrderForm } from "./ChangeOrderForm";

type Props = { projectId: string };

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:          { label: "Draft",    className: "bg-gray-100 text-gray-500" },
  SENT:           { label: "Sent",     className: "bg-amber-50 text-amber-600" },
  PARTIALLY_PAID: { label: "Partial",  className: "bg-blue-50 text-blue-600" },
  PAID:           { label: "Paid",     className: "bg-emerald-50 text-emerald-600" },
  OVERDUE:        { label: "Overdue",  className: "bg-red-50 text-red-600" },
  ACCEPTED:       { label: "Approved", className: "bg-primary/10 text-primary" },
  REJECTED:       { label: "Rejected", className: "bg-gray-100 text-gray-400" },
};

export function ChangeOrdersTab({ projectId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.invoices.list.useQuery({
    projectId,
    isChangeOrder: true,
    page: 1,
    pageSize: 100,
  });

  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Loading change orders…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                  Number
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                  Date
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">
                  Total
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((inv) => {
                const badge = STATUS_BADGE[inv.status];
                return (
                  <tr key={inv.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(inv.date)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(inv.total, inv.currency.symbol, inv.currency.symbolPosition)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !showForm && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No change orders yet.
          </div>
        )
      )}

      {showForm ? (
        <ChangeOrderForm
          projectId={projectId}
          onDone={() => {
            utils.invoices.list.invalidate({ projectId, isChangeOrder: true, page: 1, pageSize: 100 });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          New change order
        </Button>
      )}
    </div>
  );
}
