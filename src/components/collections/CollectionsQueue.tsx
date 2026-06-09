"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

const BAND_STYLES: Record<string, string> = {
  severe: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  moderate: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
};

interface DraftState {
  subject: string;
  body: string;
  tone: string | null;
  source: string | null;
}

export function CollectionsQueue() {
  const { data, isLoading } = trpc.collections.queue.useQuery({ limit: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);

  const draftReminder = trpc.collections.draftReminder.useMutation({
    onSuccess: (res) => {
      setDraft({
        subject: res.subject,
        body: res.body,
        tone: res.tone,
        source: res.source,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const sendReminder = trpc.collections.sendReminder.useMutation({
    onSuccess: (res) => {
      if (res.suppressed) {
        toast.error(`Not sent — recipient previously ${res.reason}.`);
      } else {
        toast.success("Reminder sent");
        setOpenId(null);
        setDraft(null);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading queue…</p>;
  }
  if (!data || data.queue.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to chase today. 🎉</p>;
  }

  return (
    <ul className="divide-y rounded-md border">
      {data.queue.map((row) => (
        <li key={row.invoiceId} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.clientName}</span>
                <span className="text-sm text-muted-foreground">{row.invoiceNumber}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${BAND_STYLES[row.band] ?? BAND_STYLES.low}`}
                >
                  {row.band} · {row.lateRiskPercent}%
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                ${row.balance.toFixed(2)} ·{" "}
                {row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : "due soon"} · suggested
                tone: <strong>{row.recommendedTone}</strong>
              </p>
              {row.reasons.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{row.reasons.join(" · ")}</p>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              disabled={draftReminder.isPending && openId === row.invoiceId}
              onClick={() => {
                setOpenId(row.invoiceId);
                setDraft(null);
                draftReminder.mutate({ invoiceId: row.invoiceId });
              }}
            >
              {draftReminder.isPending && openId === row.invoiceId ? "Drafting…" : "Chase"}
            </button>
          </div>

          {openId === row.invoiceId && draft && (
            <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
              <div>
                <label className="text-xs font-medium">Subject</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Message</label>
                <textarea
                  className="mt-1 h-40 w-full rounded border bg-background px-2 py-1 text-sm font-mono"
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    setOpenId(null);
                    setDraft(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  disabled={
                    sendReminder.isPending || !draft.subject.trim() || !draft.body.trim()
                  }
                  onClick={() =>
                    sendReminder.mutate({
                      invoiceId: row.invoiceId,
                      subject: draft.subject,
                      body: draft.body,
                      tone: (draft.tone as "helpful" | "professional" | "firm" | null) ?? undefined,
                      source: (draft.source as "ai" | "template_fallback" | null) ?? undefined,
                    })
                  }
                >
                  {sendReminder.isPending ? "Sending…" : "Send reminder"}
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
