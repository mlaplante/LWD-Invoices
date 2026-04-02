"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  partialPaymentId: string;
};

export function MarkPartialPaidButton({ partialPaymentId }: Props) {
  const router = useRouter();

  const markPaid = trpc.invoices.recordPartialPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment marked as paid");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      disabled={markPaid.isPending}
      onClick={() => markPaid.mutate({ partialPaymentId })}
    >
      {markPaid.isPending ? "Saving…" : "Mark Paid"}
    </Button>
  );
}
