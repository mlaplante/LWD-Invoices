"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCc(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SendInvoiceButton({
  invoiceId,
  clientId,
  autoSend = false,
}: {
  invoiceId: string;
  clientId?: string;
  autoSend?: boolean;
}) {
  const router = useRouter();
  const didAutoSend = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [ccInput, setCcInput] = useState("");
  const [ccDirty, setCcDirty] = useState(false);

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

  // Recommended send window for this client, shown as a non-blocking hint in the
  // preview dialog. Only fetched when we know the client and the dialog is open.
  const sendWindow = trpc.analytics.bestSendWindow.useQuery(
    { clientId: clientId ?? "" },
    { enabled: previewOpen && Boolean(clientId), staleTime: 60_000 },
  );

  // Pre-fill the CC input from the client's saved list the first time the
  // preview loads. `ccDirty` keeps the user's edits from being clobbered if
  // the preview query refetches.
  useEffect(() => {
    if (preview.data && !ccDirty) {
      setCcInput((preview.data.cc ?? []).join(", "));
    }
  }, [preview.data, ccDirty]);

  // Reset the dirty flag whenever the dialog closes so reopening pre-fills again.
  useEffect(() => {
    if (!previewOpen) {
      setCcDirty(false);
      setCcInput("");
    }
  }, [previewOpen]);

  const ccList = parseCc(ccInput);
  const ccInvalid = ccList.filter((e) => !EMAIL_RE.test(e));
  const ccTooMany = ccList.length > 10;
  const canSend = !send.isPending && !preview.isLoading && ccInvalid.length === 0 && !ccTooMany;

  function handleSend() {
    send.mutate({ id: invoiceId, cc: ccList.length > 0 ? ccList : undefined });
  }

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
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">To:</span> {preview.data.to}</div>
                  <div><span className="font-medium">Subject:</span> {preview.data.subject}</div>
                  {sendWindow.data && (
                    <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground">Best time to send:</span>{" "}
                        {sendWindow.data.message}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="font-medium" htmlFor="cc-input">CC:</label>
                    <Input
                      id="cc-input"
                      value={ccInput}
                      onChange={(e) => {
                        setCcInput(e.target.value);
                        setCcDirty(true);
                      }}
                      placeholder="accountant@example.com, ap@example.com"
                      aria-invalid={ccInvalid.length > 0 || ccTooMany}
                    />
                    {ccInvalid.length > 0 && (
                      <p className="text-xs text-destructive">
                        Invalid: {ccInvalid.join(", ")}
                      </p>
                    )}
                    {ccTooMany && (
                      <p className="text-xs text-destructive">Limit is 10 addresses.</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Comma-separated. Defaults to this client&apos;s saved CC list; edit for a one-off send.
                    </p>
                  </div>
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
              onClick={handleSend}
              disabled={!canSend}
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
