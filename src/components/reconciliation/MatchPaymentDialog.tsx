"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prefillAllocation } from "./allocation";

type Payment = { id: string; amount: number | { toString(): string }; matchedAmount: number | { toString(): string }; payerName?: string | null };
type Allocation = { invoiceId: string; number: string; balance: number; amount: number };
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const asNumber = (value: Payment["amount"]) => Number(value);

export function MatchPaymentDialog({ payment, open, onOpenChange }: { payment: Payment | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const invoices = trpc.paymentReconciliation.openInvoices.useQuery({ search: search || undefined }, { enabled: open });
  const total = payment ? asNumber(payment.amount) : 0;
  const previouslyMatched = payment ? asNumber(payment.matchedAmount) : 0;
  const allocated = useMemo(() => allocations.reduce((sum, allocation) => sum + allocation.amount, 0), [allocations]);
  const available = total - previouslyMatched;
  const remaining = available - allocated;
  const match = trpc.paymentReconciliation.match.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.paymentReconciliation.list.invalidate(), utils.invoices.invalidate()]);
      toast.success("Payment matched");
      setAllocations([]); onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });
  if (!payment) return null;

  function addInvoice(invoice: { id: string; number: string; balance: number }) {
    if (allocations.some((allocation) => allocation.invoiceId === invoice.id)) return;
    setAllocations((current) => [...current, { invoiceId: invoice.id, number: invoice.number, balance: invoice.balance, amount: prefillAllocation(invoice.balance, available - current.reduce((sum, item) => sum + item.amount, 0)) }]);
  }
  function setAmount(invoiceId: string, raw: string) {
    const amount = Math.max(0, Number(raw) || 0);
    setAllocations((current) => current.map((allocation) => allocation.invoiceId === invoiceId ? { ...allocation, amount } : allocation));
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Match payment{payment.payerName ? ` from ${payment.payerName}` : ""}</DialogTitle></DialogHeader>
    <div className="space-y-4"><p className="text-sm text-muted-foreground">Available to allocate: <span className="font-medium text-foreground">{money(Math.max(0, available))}</span></p>
      <div className="space-y-1.5"><Label htmlFor="invoice-search">Find open invoices</Label><Input id="invoice-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice number or client" /></div>
      <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">{invoices.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading invoices…</p>}{invoices.data?.map((invoice) => <button key={invoice.id} type="button" onClick={() => addInvoice(invoice)} className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-muted"><span><span className="font-medium">{invoice.number}</span><span className="ml-2 text-muted-foreground">{invoice.client.name}</span></span><span>{money(invoice.balance)}</span></button>)}</div>
      {allocations.length > 0 && <div className="space-y-2">{allocations.map((allocation) => <div key={allocation.invoiceId} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2 rounded-lg border p-2"><div><span className="font-medium text-sm">{allocation.number}</span><span className="ml-2 text-xs text-muted-foreground">Balance {money(allocation.balance)}</span></div><Input aria-label={`Allocation for ${allocation.number}`} type="number" min="0" step="0.01" value={allocation.amount} onChange={(event) => setAmount(allocation.invoiceId, event.target.value)} /><Button type="button" variant="ghost" size="sm" onClick={() => setAllocations((current) => current.filter((item) => item.invoiceId !== allocation.invoiceId))}>Remove</Button></div>)}</div>}
      <div className={`flex justify-between text-sm ${remaining < -0.005 ? "text-destructive" : ""}`}><span>Allocated {money(allocated)}</span><span>Remaining {money(remaining)}</span></div>
    </div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={allocations.length === 0 || remaining < -0.005 || match.isPending} onClick={() => match.mutate({ id: payment.id, applications: allocations.filter((allocation) => allocation.amount > 0).map(({ invoiceId, amount }) => ({ invoiceId, amount })) })}>{match.isPending ? "Matching…" : "Match payment"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
