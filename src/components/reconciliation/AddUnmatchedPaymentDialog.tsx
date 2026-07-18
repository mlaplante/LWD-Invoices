"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["check", "zelle", "ach", "venmo", "wire", "cash", "other"]),
  reference: z.string().max(200).optional(),
  payerName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  receivedAt: z.string().min(1),
});

const methods = [
  ["check", "Check"], ["zelle", "Zelle"], ["ach", "ACH"], ["venmo", "Venmo"],
  ["wire", "Wire"], ["cash", "Cash"], ["other", "Other"],
] as const;

export function AddUnmatchedPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof methods)[number][0]>("check");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [payerName, setPayerName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const create = trpc.paymentReconciliation.create.useMutation({
    onSuccess: async () => {
      await utils.paymentReconciliation.list.invalidate();
      toast.success("Payment added to reconciliation");
      onOpenChange(false);
      setAmount(""); setPayerName(""); setReference(""); setNotes(""); setError("");
    },
    onError: (cause) => { setError(cause.message); toast.error(cause.message); },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = formSchema.safeParse({ amount: Number(amount), method, receivedAt, payerName: payerName || undefined, reference: reference || undefined, notes: notes || undefined });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the payment details.");
    setError("");
    create.mutate({ ...parsed.data, receivedAt: new Date(parsed.data.receivedAt) });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Add received payment</DialogTitle></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="unmatched-amount">Amount</Label><Input id="unmatched-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="unmatched-date">Received date</Label><Input id="unmatched-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required /></div></div>
      <div className="space-y-1.5"><Label>Method</Label><Select value={method} onValueChange={(value) => setMethod(value as typeof method)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="unmatched-payer">Payer name</Label><Input id="unmatched-payer" value={payerName} onChange={(e) => setPayerName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="unmatched-reference">Reference</Label><Input id="unmatched-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check number or transfer note" /></div>
      <div className="space-y-1.5"><Label htmlFor="unmatched-notes">Notes</Label><Textarea id="unmatched-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add payment"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
