"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { AddUnmatchedPaymentDialog } from "./AddUnmatchedPaymentDialog";
import { MatchPaymentDialog, type ReconciliationPayment } from "./MatchPaymentDialog";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const number = (value: number | { toString(): string }) => Number(value);

export function UnmatchedPaymentsList() {
  const [showHistory, setShowHistory] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [matching, setMatching] = useState<ReconciliationPayment | null>(null);
  const utils = trpc.useUtils();
  const status: ("UNMATCHED" | "PARTIALLY_MATCHED" | "IGNORED" | "MATCHED")[] | undefined = showHistory
    ? ["UNMATCHED", "PARTIALLY_MATCHED", "IGNORED", "MATCHED"]
    : undefined;
  const payments = trpc.paymentReconciliation.list.useQuery({ status });
  const ignore = trpc.paymentReconciliation.ignore.useMutation({ onSuccess: async () => { await utils.paymentReconciliation.list.invalidate(); toast.success("Payment ignored"); }, onError: (error) => toast.error(error.message) });
  const unignore = trpc.paymentReconciliation.unignore.useMutation({ onSuccess: async () => { await utils.paymentReconciliation.list.invalidate(); toast.success("Payment restored"); }, onError: (error) => toast.error(error.message) });

  return <><div className="flex items-center justify-between gap-3"><Button onClick={() => setAddOpen(true)}>Add payment</Button><Button variant="ghost" size="sm" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Hide history" : "Show history"}</Button></div>
    {payments.isLoading && <p className="text-sm text-muted-foreground">Loading payments…</p>}
    {payments.data?.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No unmatched payments.</p>}
    {payments.data && payments.data.length > 0 && <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-3">Received</th><th className="p-3">Payer / reference</th><th className="p-3">Method</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Remaining</th><th className="p-3" /></tr></thead><tbody>{payments.data.map((payment) => { const remaining = number(payment.amount) - number(payment.matchedAmount); return <tr key={payment.id} className="border-b last:border-0"><td className="p-3 whitespace-nowrap">{new Date(payment.receivedAt).toLocaleDateString()}</td><td className="p-3"><div>{payment.payerName || "—"}</div>{payment.reference && <div className="text-xs text-muted-foreground">{payment.reference}</div>}</td><td className="p-3"><span className="rounded bg-muted px-2 py-1 text-xs capitalize">{payment.method}</span></td><td className="p-3 text-right tabular-nums">{money(number(payment.amount))}</td><td className="p-3 text-right tabular-nums">{money(remaining)}</td><td className="p-3 text-right space-x-2">{payment.status !== "IGNORED" && payment.status !== "MATCHED" && <Button size="sm" onClick={() => setMatching(payment)}>Match</Button>}{payment.status === "UNMATCHED" && <Button size="sm" variant="ghost" onClick={() => ignore.mutate({ id: payment.id })}>Ignore</Button>}{payment.status === "IGNORED" && <Button size="sm" variant="ghost" onClick={() => unignore.mutate({ id: payment.id })}>Restore</Button>}</td></tr>; })}</tbody></table></div>}
    <AddUnmatchedPaymentDialog open={addOpen} onOpenChange={setAddOpen} /><MatchPaymentDialog payment={matching} open={Boolean(matching)} onOpenChange={(open) => { if (!open) setMatching(null); }} />
  </>;
}
