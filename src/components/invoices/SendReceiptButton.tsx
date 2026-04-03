"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { toast } from "sonner";

export function SendReceiptButton({ invoiceId }: { invoiceId: string }) {
  const sendReceipt = trpc.invoices.sendReceipt.useMutation({
    onSuccess: () => toast.success("Payment receipt sent"),
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={sendReceipt.isPending}
      onClick={() => sendReceipt.mutate({ id: invoiceId })}
    >
      <Mail className="w-3.5 h-3.5 mr-1.5" />
      {sendReceipt.isPending ? "Sending…" : "Send Receipt"}
    </Button>
  );
}
