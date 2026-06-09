"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface ActionPrimitiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

/**
 * Minimal log-expense action. Requires OWNER/ADMIN/ACCOUNTANT (enforced
 * server-side by expenses.create); a 403 surfaces as a toast.
 */
export function QuickExpenseSheet({ open, onOpenChange, onCompleted }: ActionPrimitiveProps) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Expense logged");
      void utils.expenses.list?.invalidate?.();
      setName("");
      setRate("");
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  function submit() {
    const amount = Number(rate);
    if (!name.trim() || Number.isNaN(amount)) {
      toast.error("Enter a name and amount");
      return;
    }
    create.mutate({ name: name.trim(), rate: amount, qty: 1 });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qe-name">Description</Label>
            <Input id="qe-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AWS bill" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qe-rate">Amount</Label>
            <Input id="qe-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? "Saving…" : "Log expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
