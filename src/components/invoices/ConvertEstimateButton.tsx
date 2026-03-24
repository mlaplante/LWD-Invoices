"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileOutput } from "lucide-react";

export function ConvertEstimateButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const convert = trpc.invoices.convertEstimateToInvoice.useMutation({
    onSuccess: (invoice) => {
      toast.success("Invoice created from estimate");
      router.push(`/invoices/${invoice.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={convert.isPending}
      onClick={() => convert.mutate({ id: invoiceId })}
    >
      <FileOutput className="w-3.5 h-3.5 mr-1.5" />
      {convert.isPending ? "Converting…" : "Convert to Invoice"}
    </Button>
  );
}
