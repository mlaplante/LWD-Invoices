"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { RotateCcw } from "lucide-react";
import type { RefundStatus } from "@/generated/prisma";

const REFUND_BADGE: Record<RefundStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-50 text-amber-600" },
  SUCCEEDED: { label: "Refunded", className: "bg-emerald-50 text-emerald-600" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-600" },
  CANCELED: { label: "Canceled", className: "bg-gray-100 text-gray-500" },
};

/**
 * Refund management surface on the invoice detail page: per-payment refundable
 * balances with a "Refund" action (full or partial, optionally issuing a credit
 * note), plus the refund history. Stripe payments refund through Stripe; other
 * methods record a manual return.
 */
export function InvoiceRefundsPanel({ invoiceId }: { invoiceId: string }) {
  const { data } = trpc.refunds.listForInvoice.useQuery({ invoiceId });
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  if (!data) return null;
  const { refunds, payments } = data;
  const refundablePayments = payments.filter((p) => p.refundable > 0);

  // Nothing to show when there are no payments to refund and no history yet.
  if (refundablePayments.length === 0 && refunds.length === 0) return null;

  const activePayment = payments.find((p) => p.id === activePaymentId) ?? null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Refunds</h2>

      {refundablePayments.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40">
          {refundablePayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="text-sm">
                <p className="font-medium capitalize">
                  {p.method} payment · {formatDate(p.paidAt)}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {p.refundable.toFixed(2)} refundable
                  {p.refunded > 0 ? ` · ${p.refunded.toFixed(2)} already refunded` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActivePaymentId(p.id)}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Refund
              </Button>
            </div>
          ))}
        </div>
      )}

      {refunds.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                {["Date", "Method", "Amount", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                      i === 2 ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {refunds.map((r) => {
                const badge = REFUND_BADGE[r.status];
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3 capitalize">{r.method}</td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {Number(r.amount).toFixed(2)} {r.currency}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", badge.className)}>
                        {badge.label}
                      </span>
                      {r.creditNoteId && (
                        <span className="ml-2 text-xs text-muted-foreground">+ credit note</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activePayment && (
        <RefundDialog
          invoiceId={invoiceId}
          payment={activePayment}
          onClose={() => setActivePaymentId(null)}
        />
      )}
    </div>
  );
}

type RefundablePayment = {
  id: string;
  amount: number;
  method: string;
  isStripe: boolean;
  refundable: number;
};

function RefundDialog({
  invoiceId,
  payment,
  onClose,
}: {
  invoiceId: string;
  payment: RefundablePayment;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState(payment.refundable.toFixed(2));
  const [reason, setReason] = useState("requested_by_customer");
  const [notes, setNotes] = useState("");
  const [createCreditNote, setCreateCreditNote] = useState(false);

  const issue = trpc.refunds.issue.useMutation({
    onSuccess: (r) => {
      utils.refunds.listForInvoice.invalidate({ invoiceId });
      utils.invoices.get?.invalidate?.();
      toast.success(
        `Refunded ${r.amount.toFixed(2)} (${r.method})${r.creditNoteId ? " + credit note" : ""}`,
      );
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const amt = Number(amount);
  const invalid = !Number.isFinite(amt) || amt <= 0 || amt > payment.refundable + 0.0001;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {payment.isStripe ? "via Stripe" : "(manual)"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Amount (max {payment.refundable.toFixed(2)})
            </label>
            <Input
              type="number"
              min={0}
              step="0.01"
              max={payment.refundable}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setAmount(payment.refundable.toFixed(2))}
              >
                Full ({payment.refundable.toFixed(2)})
              </button>
            </div>
          </div>

          {payment.isStripe && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reason</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="requested_by_customer">Requested by customer</option>
                <option value="duplicate">Duplicate</option>
                <option value="fraudulent">Fraudulent</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (internal)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={createCreditNote}
              onCheckedChange={(v) => setCreateCreditNote(v === true)}
            />
            Also issue a credit note for this amount
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          <Button
            disabled={invalid || issue.isPending}
            onClick={() =>
              issue.mutate({
                paymentId: payment.id,
                amount: amt,
                reason: payment.isStripe ? reason : undefined,
                notes: notes || undefined,
                createCreditNote,
              })
            }
          >
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
