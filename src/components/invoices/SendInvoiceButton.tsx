"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export function SendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const send = trpc.invoices.send.useMutation({
    onSuccess: () => router.refresh(),
  });

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
