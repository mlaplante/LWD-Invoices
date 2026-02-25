"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  invoiceId: string;
  clientId: string;
}

export function ApplyCreditNoteDialog({ invoiceId, clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: creditNotes } = trpc.creditNotes.listForClient.useQuery(
    { clientId },
    { enabled: open },
  );
  const utils = trpc.useUtils();

  const apply = trpc.creditNotes.applyToInvoice.useMutation({
    onSuccess: () => {
      toast.success("Credit note applied");
      void utils.invoices.get.invalidate({ id: invoiceId });
      setOpen(false);
      setSelectedCreditNoteId("");
      setAmount("");
    },
    onError: (err) => toast.error(err.message),
  });

  const availableCreditNotes = (creditNotes ?? []).filter((cn) => {
    const applied = cn.creditNotesIssued.reduce(
      (s, a) => s + Number(a.amount),
      0,
    );
    return Number(cn.total) - applied > 0;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Apply Credit Note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Credit Note</Label>
            <Select
              value={selectedCreditNoteId}
              onValueChange={setSelectedCreditNoteId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select credit note" />
              </SelectTrigger>
              <SelectContent>
                {availableCreditNotes.map((cn) => {
                  const applied = cn.creditNotesIssued.reduce(
                    (s, a) => s + Number(a.amount),
                    0,
                  );
                  const remaining = Number(cn.total) - applied;
                  return (
                    <SelectItem key={cn.id} value={cn.id}>
                      {cn.number} — {cn.currency.symbol}
                      {remaining.toFixed(2)} available
                    </SelectItem>
                  );
                })}
                {availableCreditNotes.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No credit notes available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Amount to Apply</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {apply.error && (
            <p className="text-sm text-destructive">{apply.error.message}</p>
          )}
          <Button
            className="w-full"
            disabled={
              !selectedCreditNoteId ||
              selectedCreditNoteId === "_none" ||
              !amount ||
              apply.isPending
            }
            onClick={() =>
              apply.mutate({
                creditNoteId: selectedCreditNoteId,
                invoiceId,
                amount: Number(amount),
              })
            }
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
