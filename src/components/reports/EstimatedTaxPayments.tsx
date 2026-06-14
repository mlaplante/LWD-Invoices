"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  year: number;
  currencySymbol: string;
};

const QUARTER_LABELS: Record<number, string> = {
  1: "Q1 (Apr 15)",
  2: "Q2 (Jun 15)",
  3: "Q3 (Sep 15)",
  4: "Q4 (Jan 15)",
};

/**
 * Record and remove estimated-tax payments for a tax year. Mutations refresh
 * the server-rendered report so the paid/remaining figures stay in sync.
 */
export function EstimatedTaxPayments({ year, currencySymbol }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: payments, isLoading } = trpc.reports.estimatedTaxPayments.useQuery({ year });

  const [quarter, setQuarter] = useState(1);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const money = (n: number) =>
    `${currencySymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const refresh = () => {
    void utils.reports.estimatedTaxPayments.invalidate({ year });
    router.refresh();
  };

  const add = trpc.reports.addEstimatedTaxPayment.useMutation({
    onSuccess: () => {
      setAmount("");
      setNote("");
      toast.success("Payment recorded");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.reports.deleteEstimatedTaxPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment removed");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const parsedAmount = parseFloat(amount);
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden print:hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payments</p>
        <p className="text-base font-semibold mt-0.5">Record what you&apos;ve paid in {year}</p>
      </div>

      {/* Add form */}
      <div className="px-6 py-5 border-b border-border/50 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="etp-quarter" className="text-xs">Quarter</Label>
          <select
            id="etp-quarter"
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
            className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="etp-amount" className="text-xs">Amount</Label>
          <Input
            id="etp-amount"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-32"
          />
        </div>
        <div>
          <Label htmlFor="etp-date" className="text-xs">Date paid</Label>
          <Input
            id="etp-date"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-40"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <Label htmlFor="etp-note" className="text-xs">Note (optional)</Label>
          <Input
            id="etp-note"
            placeholder="EFTPS confirmation #"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1"
            maxLength={500}
          />
        </div>
        <Button
          size="sm"
          disabled={!valid || add.isPending}
          onClick={() =>
            add.mutate({
              year,
              quarter,
              amount: parsedAmount,
              paidAt: new Date(`${paidAt}T12:00:00Z`),
              note: note.trim() || undefined,
            })
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {add.isPending ? "Saving…" : "Add"}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="px-6 py-5">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : !payments || payments.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No payments recorded for {year} yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border/40">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-accent/20 transition-colors">
                <td className="px-6 py-3 font-medium">Q{p.quarter}</td>
                <td className="px-6 py-3 text-muted-foreground">
                  {new Date(p.paidAt).toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-6 py-3 text-muted-foreground truncate max-w-[240px]">{p.note ?? ""}</td>
                <td className="px-6 py-3 text-right font-semibold tabular-nums">{money(p.amount)}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => remove.mutate({ id: p.id })}
                    disabled={remove.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label={`Delete Q${p.quarter} payment`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
