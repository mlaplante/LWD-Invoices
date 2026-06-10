"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { InvoiceReviewPanel } from "./InvoiceReviewPanel";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, Loader2, Clock, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCc(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Tue, Jun 16, 9:00 AM" in the org's zone, so it matches the recommendation. */
function formatInZone(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [customSendAt, setCustomSendAt] = useState("");

  const utils = trpc.useUtils();

  const send = trpc.invoices.send.useMutation({
    onSuccess: () => {
      setPreviewOpen(false);
      toast.success("Invoice sent");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const scheduleSend = trpc.invoices.scheduleSend.useMutation({
    onSuccess: (updated) => {
      setScheduleOpen(false);
      utils.invoices.previewEmail.invalidate({ id: invoiceId });
      toast.success(
        updated.scheduledSendAt
          ? `Scheduled to send ${formatInZone(new Date(updated.scheduledSendAt))}`
          : "Send scheduled",
      );
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelScheduledSend = trpc.invoices.cancelScheduledSend.useMutation({
    onSuccess: () => {
      utils.invoices.previewEmail.invalidate({ id: invoiceId });
      toast.success("Scheduled send canceled");
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
      setScheduleOpen(false);
      setCustomSendAt("");
    }
  }, [previewOpen]);

  const ccList = parseCc(ccInput);
  const ccInvalid = ccList.filter((e) => !EMAIL_RE.test(e));
  const ccTooMany = ccList.length > 10;
  const ccOk = ccInvalid.length === 0 && !ccTooMany;
  const mutating = send.isPending || scheduleSend.isPending || cancelScheduledSend.isPending;
  const canSend = !mutating && !preview.isLoading && ccOk;

  const scheduledSendAt = preview.data?.scheduledSendAt
    ? new Date(preview.data.scheduledSendAt)
    : null;
  const recommendedAt = sendWindow.data?.nextOccurrence
    ? new Date(sendWindow.data.nextOccurrence)
    : null;

  function handleSend() {
    send.mutate({ id: invoiceId, cc: ccList.length > 0 ? ccList : undefined });
  }

  function handleSchedule(sendAt: Date) {
    scheduleSend.mutate({
      id: invoiceId,
      sendAt,
      cc: ccList.length > 0 ? ccList : undefined,
    });
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
      <InvoiceReviewPanel invoiceId={invoiceId} />
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
                  {scheduledSendAt && (
                    <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">
                        <span className="font-medium">Scheduled:</span>{" "}
                        sends {formatInZone(scheduledSendAt)}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium hover:underline disabled:opacity-50"
                        onClick={() => cancelScheduledSend.mutate({ id: invoiceId })}
                        disabled={mutating}
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    </div>
                  )}
                  {sendWindow.data && !scheduledSendAt && (
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
                  {scheduleOpen && (
                    <div className="space-y-2 rounded-md border border-border/60 p-2.5">
                      <p className="font-medium text-foreground">Schedule this send</p>
                      {recommendedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          disabled={mutating || !ccOk}
                          onClick={() => handleSchedule(recommendedAt)}
                        >
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          Best window: {formatInZone(recommendedAt, sendWindow.data?.timeZone)}
                        </Button>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          type="datetime-local"
                          value={customSendAt}
                          onChange={(e) => setCustomSendAt(e.target.value)}
                          className="h-8 text-xs"
                          aria-label="Custom send time"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutating || !ccOk || !customSendAt}
                          onClick={() => {
                            const date = new Date(customSendAt);
                            if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
                              toast.error("Pick a time in the future");
                              return;
                            }
                            handleSchedule(date);
                          }}
                        >
                          Schedule
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The invoice is emailed automatically at the scheduled time, with the CC list above.
                      </p>
                    </div>
                  )}
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
            {!scheduledSendAt && (
              <Button
                variant="outline"
                onClick={() => setScheduleOpen((v) => !v)}
                disabled={mutating || preview.isLoading}
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
                Schedule
              </Button>
            )}
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
