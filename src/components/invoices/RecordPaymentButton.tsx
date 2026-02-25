"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

type Props = {
  invoiceId: string;
  invoiceTotal: number;
};

export function RecordPaymentButton({ invoiceId, invoiceTotal }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Record Payment
      </Button>
      <RecordPaymentDialog
        invoiceId={invoiceId}
        invoiceTotal={invoiceTotal}
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
