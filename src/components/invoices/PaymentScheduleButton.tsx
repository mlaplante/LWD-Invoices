"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { PaymentScheduleDialog, type PartialPaymentEntry } from "./PaymentScheduleDialog";

type Props = {
  invoiceId: string;
  invoiceTotal: number;
  invoiceDueDate?: string | null;
  currencySymbol: string;
  currencySymbolPosition: string;
  existingSchedule: PartialPaymentEntry[];
};

export function PaymentScheduleButton({
  invoiceId,
  invoiceTotal,
  invoiceDueDate,
  currencySymbol,
  currencySymbolPosition,
  existingSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const setSchedule = trpc.partialPayments.set.useMutation({
    onSuccess: () => {
      toast.success("Payment schedule saved");
      setOpen(false);
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave(schedule: PartialPaymentEntry[]) {
    setSchedule.mutate({
      invoiceId,
      schedule: schedule.map((s) => ({
        sortOrder: s.sortOrder,
        amount: s.amount,
        isPercentage: s.isPercentage,
        dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
        notes: s.notes || undefined,
      })),
    });
  }

  const hasSchedule = existingSchedule.length > 0;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
        {hasSchedule ? "Edit Schedule" : "Payment Schedule"}
      </Button>
      <PaymentScheduleDialog
        open={open}
        onOpenChange={setOpen}
        invoiceTotal={invoiceTotal}
        invoiceDueDate={invoiceDueDate}
        currencySymbol={currencySymbol}
        currencySymbolPosition={currencySymbolPosition}
        existingSchedule={existingSchedule}
        onSave={handleSave}
        saving={setSchedule.isPending}
      />
    </>
  );
}
