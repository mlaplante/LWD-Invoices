"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { Archive } from "lucide-react";

type Props = {
  invoiceId: string;
  isArchived: boolean;
};

export function ArchiveInvoiceButton({ invoiceId, isArchived }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const archive = trpc.invoices.archive.useMutation({
    onSuccess: () => {
      toast.success(isArchived ? "Invoice unarchived" : "Invoice archived");
      router.refresh();
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Archive className="w-3.5 h-3.5 mr-1.5" />
        {isArchived ? "Unarchive" : "Archive"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={isArchived ? "Unarchive Invoice?" : "Archive Invoice?"}
        description={
          isArchived
            ? "This invoice will be moved back to the active list."
            : "This invoice will be hidden from the main list. You can unarchive it later."
        }
        onConfirm={() => archive.mutate({ id: invoiceId, isArchived: !isArchived })}
        loading={archive.isPending}
      />
    </>
  );
}
