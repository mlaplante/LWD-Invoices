"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Plus } from "lucide-react";

export function RetainerPanel({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const { data: retainer, isLoading } = trpc.retainers.getForClient.useQuery({
    clientId,
  });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [description, setDescription] = useState("");

  const depositMutation = trpc.retainers.deposit.useMutation({
    onSuccess: () => {
      toast.success("Deposit recorded");
      utils.retainers.getForClient.invalidate({ clientId });
      setOpen(false);
      setAmount("");
      setMethod("");
      setDescription("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDeposit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    depositMutation.mutate({
      clientId,
      amount: parsed,
      method: method || undefined,
      description: description || undefined,
    });
  };

  if (isLoading) return null;

  const balance = retainer ? Number(retainer.balance) : 0;
  const transactions = retainer?.transactions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Retainer</h2>
        <div className="flex items-center gap-3">
          <span className={cn("text-sm font-semibold", balance > 0 ? "text-emerald-600" : "text-muted-foreground")}>
            Balance: ${balance.toFixed(2)}
          </span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Record Deposit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Retainer Deposit</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium">Amount</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Payment Method</label>
                  <Input
                    placeholder="e.g. Bank Transfer, Check"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description (optional)</label>
                  <Input
                    placeholder="e.g. Project retainer deposit"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleDeposit}
                  disabled={depositMutation.isPending}
                >
                  {depositMutation.isPending ? "Recording..." : "Record Deposit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                {["Date", "Type", "Description", "Amount"].map((h, i) => (
                  <th
                    key={h}
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
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">{formatDate(t.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize",
                        t.type === "deposit"
                          ? "bg-emerald-50 text-emerald-600"
                          : t.type === "drawdown"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {t.description ?? "--"}
                    {t.invoice && (
                      <span className="ml-1 text-xs text-primary">
                        (Inv #{t.invoice.number})
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right font-semibold",
                      t.type === "deposit"
                        ? "text-emerald-600"
                        : "text-amber-600",
                    )}
                  >
                    {t.type === "deposit" ? "+" : "-"}$
                    {Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
