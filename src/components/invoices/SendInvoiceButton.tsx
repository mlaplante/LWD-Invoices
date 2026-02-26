"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";

export function SendInvoiceButton({
  invoiceId,
  autoSend = false,
}: {
  invoiceId: string;
  autoSend?: boolean;
}) {
  const router = useRouter();
  const send = trpc.invoices.send.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (autoSend && !send.isPending && !send.isSuccess && !send.isError) {
      send.mutate({ id: invoiceId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, invoiceId]);

  return (
    <Button
      size="sm"
      disabled={send.isPending}
      onClick={() => send.mutate({ id: invoiceId })}
    >
      <Send className="w-3.5 h-3.5 mr-1.5" />
      {send.isPending ? "Sending…" : "Send"}
    </Button>
  );
}
