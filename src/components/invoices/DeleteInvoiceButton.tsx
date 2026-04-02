"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function DeleteInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const del = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success("Invoice deleted");
      router.push("/invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Invoice?"
        description="This invoice will be permanently deleted along with its line items and payment records. This action cannot be undone."
        onConfirm={() => del.mutate({ id: invoiceId })}
        loading={del.isPending}
        destructive
      />
    </>
  );
}
