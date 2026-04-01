"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Ban } from "lucide-react";

interface Props {
  creditNoteId: string;
  creditNoteStatus: string | null;
}

export function CreditNoteActions({ creditNoteId, creditNoteStatus }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const issue = trpc.creditNotes.issue.useMutation({
    onSuccess: () => {
      toast.success("Credit note issued");
      void utils.invoices.get.invalidate({ id: creditNoteId });
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const voidCn = trpc.creditNotes.void.useMutation({
    onSuccess: () => {
      toast.success("Credit note voided");
      void utils.invoices.get.invalidate({ id: creditNoteId });
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const canIssue = creditNoteStatus === "DRAFT";
  const canVoid = creditNoteStatus === "DRAFT" || creditNoteStatus === "ISSUED";

  return (
    <>
      {canIssue && (
        <Button
          variant="default"
          size="sm"
          disabled={issue.isPending}
          onClick={() => issue.mutate({ id: creditNoteId })}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          {issue.isPending ? "Issuing..." : "Issue Credit Note"}
        </Button>
      )}
      {canVoid && (
        <Button
          variant="destructive"
          size="sm"
          disabled={voidCn.isPending}
          onClick={() => voidCn.mutate({ id: creditNoteId })}
        >
          <Ban className="w-3.5 h-3.5 mr-1.5" />
          {voidCn.isPending ? "Voiding..." : "Void"}
        </Button>
      )}
    </>
  );
}
