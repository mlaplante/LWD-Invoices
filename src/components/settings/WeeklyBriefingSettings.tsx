"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, X, Send, Mail } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Settings for the proactive weekly business briefing. Toggle on/off, manage the
 * recipient list (empty = fall back to org admins), preview the headline numbers,
 * and fire a test send.
 */
export function WeeklyBriefingSettings() {
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.organization.get.useQuery();
  const { data: preview } = trpc.analytics.weeklyBriefing.useQuery(undefined, {
    staleTime: 60_000,
  });

  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (org) setRecipients(org.weeklyBriefingRecipients ?? []);
  }, [org]);

  const update = trpc.organization.update.useMutation({
    onSuccess: () => {
      utils.organization.get.invalidate();
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendNow = trpc.analytics.sendWeeklyBriefingNow.useMutation({
    onSuccess: (r) => {
      if (r.sent) toast.success(`Briefing sent to ${r.recipients} recipient${r.recipients === 1 ? "" : "s"}`);
      else toast.error("No recipients — add one or ensure an admin has an email on file.");
    },
    onError: (e) => toast.error(e.message),
  });

  function addEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      toast.error("Enter a valid email");
      return;
    }
    if (recipients.includes(e)) {
      setNewEmail("");
      return;
    }
    if (recipients.length >= 10) {
      toast.error("Up to 10 recipients");
      return;
    }
    const next = [...recipients, e];
    setRecipients(next);
    setNewEmail("");
    update.mutate({ weeklyBriefingRecipients: next });
  }

  function removeEmail(e: string) {
    const next = recipients.filter((r) => r !== e);
    setRecipients(next);
    update.mutate({ weeklyBriefingRecipients: next });
  }

  const enabled = org?.weeklyBriefingEnabled ?? false;
  const symbol = preview?.currencySymbol ?? "$";
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString("en-US")}`;
  const h30 = preview?.forecast.find((h) => h.horizonDays === 30);

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Send a weekly briefing</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Every Monday morning we email a snapshot of your business — overdue total,
              clients at risk, and projected cash — so the numbers come to you.
            </p>
            {org?.weeklyBriefingLastSentAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Last sent {new Date(org.weeklyBriefingLastSentAt).toLocaleString()}
              </p>
            )}
          </div>
          <Switch
            checked={enabled}
            disabled={isLoading || update.isPending}
            onCheckedChange={(v) => update.mutate({ weeklyBriefingEnabled: v })}
          />
        </div>
      </div>

      {/* Recipients */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-base font-semibold">Recipients</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Leave empty to send to all org owners and admins.
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          {recipients.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recipients.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  {e}
                  <button
                    onClick={() => removeEmail(e)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${e}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Falling back to org admins.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="name@company.com"
              value={newEmail}
              onChange={(ev) => setNewEmail(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  addEmail();
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={addEmail} disabled={update.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold">This week&apos;s briefing</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {preview?.headline ?? "Calculating…"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => sendNow.mutate()}
            disabled={sendNow.isPending}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Send now
          </Button>
        </div>
        {preview && (
          <div className="px-6 py-5 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Overdue</p>
              <p className="text-xl font-bold text-red-600 mt-0.5">{money(preview.overdue.total)}</p>
              <p className="text-xs text-muted-foreground">{preview.overdue.count} invoices</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">At risk</p>
              <p className="text-xl font-bold mt-0.5">{preview.atRiskClients.length}</p>
              <p className="text-xs text-muted-foreground">clients</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Projected 30d</p>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">
                {h30 ? money(h30.projectedInflow) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {h30 ? `${Math.round(h30.confidence * 100)}% confidence` : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
