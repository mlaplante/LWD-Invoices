"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "money_order", label: "Money Order" },
  { value: "other", label: "Other" },
];

type Props = {
  invoiceId: string;
  invoiceTotal: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function RecordPaymentDialog({
  invoiceId,
  invoiceTotal,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [amount, setAmount] = useState(invoiceTotal.toFixed(2));
  const [method, setMethod] = useState("bank_transfer");
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [gatewayFee, setGatewayFee] = useState("0");
  const [error, setError] = useState("");

  const markPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    markPaid.mutate({
      id: invoiceId,
      amount: amountNum,
      method,
      transactionId: transactionId.trim() || undefined,
      notes: notes.trim() || undefined,
      paidAt: new Date(paidAt),
      gatewayFee: parseFloat(gatewayFee) || 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paidAt">Date</Label>
              <Input
                id="paidAt"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="method">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transactionId">
              Transaction ID <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="transactionId"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. ch_abc123"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gatewayFee">
              Gateway Fee <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="gatewayFee"
              type="number"
              step="0.01"
              min="0"
              value={gatewayFee}
              onChange={(e) => setGatewayFee(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={markPaid.isPending}>
              {markPaid.isPending ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
