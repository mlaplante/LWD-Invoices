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
import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";

export function ApplyRetainerDialog({
  invoiceId,
  clientId,
  invoiceTotal,
  invoicePaid,
  retainerAlreadyApplied,
}: {
  invoiceId: string;
  clientId: string;
  invoiceTotal: number;
  invoicePaid: number;
  retainerAlreadyApplied: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const { data: retainer } = trpc.retainers.getForClient.useQuery(
    { clientId },
    { enabled: open },
  );

  const applyMutation = trpc.retainers.applyToInvoice.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.invoiceMarkedPaid
          ? "Retainer applied - invoice marked as paid"
          : "Retainer applied successfully",
      );
      setOpen(false);
      setAmount("");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const balance = retainer ? Number(retainer.balance) : 0;
  const remaining = invoiceTotal - invoicePaid - retainerAlreadyApplied;
  const maxApplicable = Math.min(balance, Math.max(remaining, 0));

  const handleApply = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (parsed > maxApplicable) {
      toast.error(`Maximum applicable amount is $${maxApplicable.toFixed(2)}`);
      return;
    }
    applyMutation.mutate({
      clientId,
      invoiceId,
      amount: parsed,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wallet className="w-3.5 h-3.5 mr-1.5" />
          Apply Retainer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Retainer to Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Retainer Balance</span>
              <p className="font-semibold text-emerald-600">
                ${balance.toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Invoice Remaining</span>
              <p className="font-semibold">
                ${Math.max(remaining, 0).toFixed(2)}
              </p>
            </div>
          </div>
          {retainerAlreadyApplied > 0 && (
            <p className="text-xs text-muted-foreground">
              Already applied from retainer: ${retainerAlreadyApplied.toFixed(2)}
            </p>
          )}
          <div>
            <label className="text-sm font-medium">
              Amount to Apply (max ${maxApplicable.toFixed(2)})
            </label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={maxApplicable}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAmount(maxApplicable.toFixed(2))}
                className="shrink-0"
              >
                Max
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleApply}
            disabled={applyMutation.isPending || maxApplicable <= 0}
          >
            {applyMutation.isPending ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
