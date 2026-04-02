"use client";

import { trpc } from "@/trpc/client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ResendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const send = trpc.invoices.send.useMutation({
    onSuccess: () => {
      toast.success("Invoice resent");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <button
      disabled={send.isPending}
      onClick={(e) => {
        e.preventDefault();
        send.mutate({ id: invoiceId });
      }}
      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
    >
      <RotateCcw className="w-3 h-3" />
      {send.isPending ? "Sending…" : "Resend"}
    </button>
  );
}
