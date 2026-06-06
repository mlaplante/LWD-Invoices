"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  invoiceId: string | null;
  invoiceNumber?: string;
  onClose: () => void;
}

/**
 * Review-then-send reminder dialog for the Smart Collections queue. On open it
 * asks the server for a smart draft (Gemini-first, tone chosen from payment
 * history, fact-guarded), lets the user edit subject/body, then sends.
 */
export function CollectionsReminderDialog({ invoiceId, invoiceNumber, onClose }: Props) {
  const open = invoiceId !== null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);

  const draft = trpc.collections.draftReminder.useMutation({
    onSuccess: (res) => {
      setSubject(res.subject);
      setBody(res.body);
      setTone(res.tone);
      setSource(res.source);
      setClientEmail(res.clientEmail);
    },
    onError: (err) => toast.error(err.message),
  });

  const utils = trpc.useUtils();
  const send = trpc.collections.sendReminder.useMutation({
    onSuccess: (res) => {
      if (res.suppressed) {
        toast.error(`Not sent — recipient previously ${res.reason}.`);
      } else {
        toast.success("Reminder sent");
        // Refresh the dunning queue (count + cooldown) and the invoice's reminder
        // history so both surfaces reflect the send without a reload.
        void utils.analytics.collectionsRisk.invalidate();
        if (invoiceId) void utils.invoices.reminderHistory.invalidate({ invoiceId });
        // Client-level surfaces (panel + "last reminded" chip) — invalidate all
        // since the dialog only knows the invoice, not its client.
        void utils.clients.reminderHistory.invalidate();
        void utils.clients.lastReminded.invalidate();
        onClose();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Fetch a fresh draft whenever a new invoice is selected.
  const draftMutate = draft.mutate;
  useEffect(() => {
    if (invoiceId) {
      setSubject("");
      setBody("");
      setTone(null);
      setSource(null);
      setClientEmail(null);
      draftMutate({ invoiceId });
    }
  }, [invoiceId, draftMutate]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send reminder{invoiceNumber ? ` · #${invoiceNumber}` : ""}</DialogTitle>
          <DialogDescription>
            Review the AI-drafted reminder before sending. Tone is chosen from the client&apos;s
            payment history.
          </DialogDescription>
        </DialogHeader>

        {draft.isPending ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Drafting reminder…</p>
        ) : (
          <div className="space-y-3">
            {(tone || source) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5" />
                {tone && <span>Tone: {tone}</span>}
                {source && <span>· {source === "ai" ? "AI-drafted" : "template"}</span>}
                {clientEmail && <span>· to {clientEmail}</span>}
              </div>
            )}
            <div>
              <label className="text-xs font-medium">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Message</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              invoiceId &&
              send.mutate({
                invoiceId,
                subject,
                body,
                tone: (tone as "helpful" | "professional" | "firm" | null) ?? undefined,
                source: (source as "ai" | "template_fallback" | null) ?? undefined,
              })
            }
            disabled={draft.isPending || send.isPending || !subject.trim() || !body.trim()}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {send.isPending ? "Sending…" : "Send reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
