"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, CheckCircle2, XCircle, Mail, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { TOUCH_TYPE_LABELS } from "@/server/services/check-in-templates";
import type { ClientCheckInOutcome } from "@/generated/prisma";

const STATUS_COPY = {
  active: { label: "Active", color: "text-emerald-700 bg-emerald-50" },
  recent: { label: "Recent (<90d)", color: "text-blue-700 bg-blue-50" },
  warm: { label: "Warm (<1y)", color: "text-amber-700 bg-amber-50" },
  cold: { label: "Cold (>1y)", color: "text-slate-700 bg-slate-100" },
} as const;

type Props = {
  checkInId: string | null;
  onClose: () => void;
};

export function CheckInDrawer({ checkInId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.clientCheckIns.getDraft.useQuery(
    { id: checkInId ?? "" },
    { enabled: !!checkInId },
  );

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<ClientCheckInOutcome | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (data) {
      setSubject(data.draft.subject);
      setBody(data.draft.body);
      setNotes(data.checkIn.notes ?? "");
      setOutcome(data.checkIn.outcome ?? "");
    }
  }, [data]);

  const invalidate = () => {
    utils.clientCheckIns.list.invalidate();
    utils.clientCheckIns.queueSummary.invalidate();
  };

  const completeMutation = trpc.clientCheckIns.complete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Marked complete");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const dismissMutation = trpc.clientCheckIns.dismiss.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Dismissed");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const snoozeMutation = trpc.clientCheckIns.snooze.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Snoozed");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const reopenMutation = trpc.clientCheckIns.reopen.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Reopened");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const handleComplete = () => {
    if (!checkInId || !outcome) {
      toast.error("Pick an outcome first");
      return;
    }
    completeMutation.mutate({ id: checkInId, outcome, notes: notes || undefined });
  };

  const isPending = data?.checkIn.status === "PENDING";
  const clientEmail = data?.checkIn.client.email;
  const mailtoHref = clientEmail
    ? `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <Sheet open={!!checkInId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider rounded bg-muted px-2 py-0.5">
                  {TOUCH_TYPE_LABELS[data.checkIn.touchType]}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider rounded px-2 py-0.5 ${STATUS_COPY[data.clientStatus].color}`}
                >
                  {STATUS_COPY[data.clientStatus].label}
                </span>
              </div>
              <SheetTitle className="text-xl">{data.checkIn.client.name}</SheetTitle>
              <SheetDescription>
                {data.checkIn.project ? (
                  <>
                    <Link
                      href={`/projects/${data.checkIn.project.id}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {data.checkIn.project.name}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </>
                ) : (
                  "Client-level check-in"
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 space-y-5 pb-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Draft Message
                  </p>
                  {data.usingDefault && (
                    <Link
                      href="/settings/retention"
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      Default template
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Subject</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Body</label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copyToClipboard}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </Button>
                  {mailtoHref && (
                    <Button asChild type="button" variant="outline" size="sm">
                      <a href={mailtoHref}>
                        <Mail className="w-3.5 h-3.5 mr-1.5" />
                        Open in mail
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Edit the draft before sending — automated-sounding messages are
                  transparent and counterproductive. The system reminded you;
                  the message should sound like you remembered.
                </p>
              </div>

              {isPending ? (
                <div className="space-y-4 rounded-xl border border-border/50 p-4 bg-muted/20">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Close Out
                  </p>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Outcome</label>
                    <Select
                      value={outcome}
                      onValueChange={(v) => setOutcome(v as ClientCheckInOutcome)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="What happened?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW_WORK">New work</SelectItem>
                        <SelectItem value="REFERRAL">Referral</SelectItem>
                        <SelectItem value="NOTHING">Nothing yet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Notes (optional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="What stood out?"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleComplete}
                      disabled={!outcome || completeMutation.isPending}
                      size="sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Mark complete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        snoozeMutation.mutate({ id: data.checkIn.id, days: 14 })
                      }
                      disabled={snoozeMutation.isPending}
                    >
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      Snooze 2w
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        dismissMutation.mutate({
                          id: data.checkIn.id,
                          notes: notes || undefined,
                        })
                      }
                      disabled={dismissMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 p-4 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {data.checkIn.status === "COMPLETED" ? "Completed" : "Dismissed"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => reopenMutation.mutate({ id: data.checkIn.id })}
                      disabled={reopenMutation.isPending}
                    >
                      Reopen
                    </Button>
                  </div>
                  {data.checkIn.outcome && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Outcome: </span>
                      <span className="font-medium">
                        {data.checkIn.outcome.replace("_", " ").toLowerCase()}
                      </span>
                    </p>
                  )}
                  {data.checkIn.notes && (
                    <p className="text-sm whitespace-pre-wrap">{data.checkIn.notes}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
