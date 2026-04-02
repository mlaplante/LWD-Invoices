"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";

interface LineItem {
  id: string;
  name: string;
  description: string | null;
  qty: number | { toString(): string };
  rate: number | { toString(): string };
  subtotal: number | { toString(): string };
}

interface Props {
  invoiceId: string;
  lines: LineItem[];
  currencySymbol: string;
  currencySymbolPosition: string;
}

function fmt(
  n: number | { toString(): string },
  symbol: string,
  pos: string,
): string {
  const val = typeof n === "number" ? n : Number(n.toString());
  return pos === "before" ? `${symbol}${val.toFixed(2)}` : `${val.toFixed(2)}${symbol}`;
}

export function IssueCreditNoteDialog({
  invoiceId,
  lines,
  currencySymbol,
  currencySymbolPosition,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const router = useRouter();

  const create = trpc.creditNotes.create.useMutation({
    onSuccess: (data) => {
      toast.success("Credit note created");
      setOpen(false);
      router.push(`/invoices/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLineIds.size === lines.length) {
      setSelectedLineIds(new Set());
    } else {
      setSelectedLineIds(new Set(lines.map((l) => l.id)));
    }
  };

  const f = (n: number | { toString(): string }) =>
    fmt(n, currencySymbol, currencySymbolPosition);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSelectedLineIds(new Set());
          setNotes("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ReceiptText className="w-3.5 h-3.5 mr-1.5" />
          Credit Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue Credit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the line items to include in the credit note.
          </p>

          {/* Select all */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectedLineIds.size === lines.length && lines.length > 0}
              onCheckedChange={toggleAll}
            />
            <Label htmlFor="select-all" className="text-sm font-medium">
              Select all
            </Label>
          </div>

          {/* Line items */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {lines.map((line) => (
              <label
                key={line.id}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <Checkbox
                  checked={selectedLineIds.has(line.id)}
                  onCheckedChange={() => toggleLine(line.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{line.name}</p>
                  {line.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {line.description}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0">
                  {f(line.subtotal)}
                </span>
              </label>
            ))}
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for credit..."
              rows={3}
            />
          </div>

          <Button
            className="w-full"
            disabled={selectedLineIds.size === 0 || create.isPending}
            onClick={() =>
              create.mutate({
                sourceInvoiceId: invoiceId,
                lineIds: Array.from(selectedLineIds),
                notes: notes || undefined,
              })
            }
          >
            {create.isPending ? "Creating..." : "Create Credit Note"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
