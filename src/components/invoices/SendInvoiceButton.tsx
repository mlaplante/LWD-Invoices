"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SendInvoiceButton({
  invoiceId,
  autoSend = false,
}: {
  invoiceId: string;
  autoSend?: boolean;
}) {
  const router = useRouter();
  const didAutoSend = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const send = trpc.invoices.send.useMutation({
    onSuccess: () => {
      setPreviewOpen(false);
      toast.success("Invoice sent");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const preview = trpc.invoices.previewEmail.useQuery(
    { id: invoiceId },
    { enabled: previewOpen },
  );

  // Auto-send skips preview (used for programmatic redirects)
  useEffect(() => {
    if (autoSend && !didAutoSend.current) {
      didAutoSend.current = true;
      send.mutate({ id: invoiceId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, invoiceId]);

  return (
    <>
      <Button
        size="sm"
        disabled={send.isPending}
        onClick={() => setPreviewOpen(true)}
      >
        <Send className="w-3.5 h-3.5 mr-1.5" />
        {send.isPending ? "Sending…" : "Send"}
      </Button>

      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Preview & Send Invoice</AlertDialogTitle>
            {preview.data && (
              <AlertDialogDescription asChild>
                <div className="space-y-1 text-sm">
                  <div><span className="font-medium">To:</span> {preview.data.to}</div>
                  <div><span className="font-medium">Subject:</span> {preview.data.subject}</div>
                </div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-white">
            {preview.isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : preview.data ? (
              <iframe
                srcDoc={preview.data.html}
                sandbox=""
                title="Email preview"
                className="w-full h-[50vh] border-0"
              />
            ) : preview.error ? (
              <div className="flex items-center justify-center h-64 text-sm text-destructive">
                Failed to load preview
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={send.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => send.mutate({ id: invoiceId })}
              disabled={send.isPending || preview.isLoading}
            >
              {send.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Send Invoice
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
