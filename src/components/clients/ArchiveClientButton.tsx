"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { Archive } from "lucide-react";

type Props = {
  clientId: string;
  isArchived: boolean;
};

export function ArchiveClientButton({ clientId, isArchived }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const archive = trpc.clients.archive.useMutation({
    onSuccess: () => {
      toast.success(isArchived ? "Client unarchived" : "Client archived");
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
        title={isArchived ? "Unarchive Client?" : "Archive Client?"}
        description={
          isArchived
            ? "This client will be moved back to the active list."
            : "This client will be hidden from the main list. Their invoices remain intact."
        }
        onConfirm={() => archive.mutate({ id: clientId, isArchived: !isArchived })}
        loading={archive.isPending}
      />
    </>
  );
}
