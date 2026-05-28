"use client";

import { useEffect, useState } from "react";
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
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCc(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SendReceiptButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [ccInput, setCcInput] = useState("");
  const [ccDirty, setCcDirty] = useState(false);

  const recipients = trpc.invoices.receiptRecipients.useQuery(
    { id: invoiceId },
    { enabled: open },
  );

  const sendReceipt = trpc.invoices.sendReceipt.useMutation({
    onSuccess: () => {
      setOpen(false);
      toast.success("Payment receipt sent");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (recipients.data && !ccDirty) {
      setCcInput((recipients.data.cc ?? []).join(", "));
    }
  }, [recipients.data, ccDirty]);

  useEffect(() => {
    if (!open) {
      setCcDirty(false);
      setCcInput("");
    }
  }, [open]);

  const ccList = parseCc(ccInput);
  const ccInvalid = ccList.filter((e) => !EMAIL_RE.test(e));
  const ccTooMany = ccList.length > 10;
  const canSend =
    !sendReceipt.isPending && !recipients.isLoading && ccInvalid.length === 0 && !ccTooMany;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={sendReceipt.isPending}
        onClick={() => setOpen(true)}
      >
        <Mail className="w-3.5 h-3.5 mr-1.5" />
        {sendReceipt.isPending ? "Sending…" : "Send Receipt"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Payment Receipt</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {recipients.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading recipients…
                  </div>
                ) : recipients.data ? (
                  <>
                    <div>
                      <span className="font-medium">To:</span> {recipients.data.to}
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium" htmlFor="receipt-cc-input">CC:</label>
                      <Input
                        id="receipt-cc-input"
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
                        Comma-separated. Defaults to this client&apos;s saved CC list.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={sendReceipt.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendReceipt.mutate({
                  id: invoiceId,
                  cc: ccList.length > 0 ? ccList : undefined,
                })
              }
              disabled={!canSend}
            >
              {sendReceipt.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  Send Receipt
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
