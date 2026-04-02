"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export function LateFeeSection({ invoiceId }: { invoiceId: string }) {
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.lateFees.listForInvoice.useQuery({
    invoiceId,
  });

  const waiveMutation = trpc.lateFees.waive.useMutation({
    onSuccess: () => {
      toast.success("Late fee waived");
      utils.lateFees.listForInvoice.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return null;
  if (!entries || entries.length === 0) return null;

  const totalActive = entries
    .filter((e) => !e.isWaived)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Late Fees</h2>
        {totalActive > 0 && (
          <span className="text-sm font-medium text-red-600">
            Total: ${totalActive.toFixed(2)}
          </span>
        )}
      </div>
      <div className="rounded-2xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border/50">
            <tr>
              {["Date", "Type", "Rate", "Amount", "Status", ""].map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                    i === 3 ? "text-right" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3">{formatDate(entry.createdAt)}</td>
                <td className="px-5 py-3 capitalize">{entry.feeType}</td>
                <td className="px-5 py-3">
                  {entry.feeType === "percentage"
                    ? `${Number(entry.feeRate)}%`
                    : `$${Number(entry.feeRate).toFixed(2)}`}
                </td>
                <td className="px-5 py-3 text-right font-semibold">
                  ${Number(entry.amount).toFixed(2)}
                </td>
                <td className="px-5 py-3">
                  {entry.isWaived ? (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500">
                      Waived
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-600">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {!entry.isWaived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={waiveMutation.isPending}
                      onClick={() => waiveMutation.mutate({ id: entry.id })}
                    >
                      Waive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
