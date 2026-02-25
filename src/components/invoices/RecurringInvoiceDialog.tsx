"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RecurringFrequency } from "@/generated/prisma";
import { toast } from "sonner";

interface Props {
  invoiceId: string;
}

export function RecurringInvoiceDialog({ invoiceId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: existing } = trpc.recurringInvoices.getForInvoice.useQuery({ invoiceId });
  const utils = trpc.useUtils();

  const upsert = trpc.recurringInvoices.upsert.useMutation({
    onSuccess: () => {
      toast.success("Recurring schedule saved");
      void utils.recurringInvoices.getForInvoice.invalidate({ invoiceId });
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = trpc.recurringInvoices.cancel.useMutation({
    onSuccess: () => {
      void utils.recurringInvoices.getForInvoice.invalidate({ invoiceId });
    },
  });

  const [frequency, setFrequency] = useState<RecurringFrequency>(
    RecurringFrequency.MONTHLY,
  );
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [autoSend, setAutoSend] = useState(false);

  useEffect(() => {
    if (existing) {
      setFrequency(existing.frequency);
      setInterval(existing.interval);
      setStartDate(new Date(existing.startDate).toISOString().split("T")[0]);
      setAutoSend(existing.autoSend);
    }
  }, [existing]);

  const isActive = existing?.isActive ?? false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      invoiceId,
      data: {
        frequency,
        interval,
        startDate: new Date(startDate),
        autoSend,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {isActive ? "Edit Recurring" : "Set Recurring"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recurring Invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as RecurringFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Every</Label>
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoSend} onCheckedChange={setAutoSend} />
            <Label>Auto-send generated invoices</Label>
          </div>
          <div className="flex gap-2 justify-end">
            {isActive && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => cancel.mutate({ invoiceId })}
              >
                Cancel Recurring
              </Button>
            )}
            <Button type="submit" disabled={upsert.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
