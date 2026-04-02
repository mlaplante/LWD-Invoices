"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export function DuplicateInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const duplicate = trpc.invoices.duplicate.useMutation({
    onSuccess: (invoice) => {
      toast.success("Invoice duplicated");
      router.push(`/invoices/${invoice.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={duplicate.isPending}
      onClick={() => duplicate.mutate({ id: invoiceId })}
    >
      <Copy className="w-3.5 h-3.5 mr-1.5" />
      {duplicate.isPending ? "Duplicating…" : "Duplicate"}
    </Button>
  );
}
