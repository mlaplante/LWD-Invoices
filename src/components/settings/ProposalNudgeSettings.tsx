"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  initialEnabled: boolean;
  initialDelayHours: number;
};

/**
 * Org-level controls for the proposal "viewed but not signed" nudge — the
 * client-facing analog of the invoice viewed-but-unpaid reminder. The nudge
 * cron emails the client once a sent proposal has been opened but remains
 * unsigned for `delayHours`.
 */
export function ProposalNudgeSettings({ initialEnabled, initialDelayHours }: Props) {
  const utils = trpc.useUtils();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [delayHours, setDelayHours] = useState(initialDelayHours);

  const update = trpc.organization.update.useMutation({
    onSuccess: () => {
      utils.organization.get.invalidate();
      toast.success("Proposal nudge settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const dirty = enabled !== initialEnabled || delayHours !== initialDelayHours;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Viewed-but-not-signed nudge</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automatically email the client a gentle follow-up when they&apos;ve opened a sent
          proposal but haven&apos;t signed it yet. Sends once per proposal.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">Enable proposal follow-up nudges</span>
      </label>

      <div className="flex items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Hours after first open</label>
          <input
            type="number"
            min={1}
            max={720}
            value={delayHours}
            disabled={!enabled}
            onChange={(e) => setDelayHours(parseInt(e.target.value) || 1)}
            className="mt-1 block w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          Default 48h. The nudge fires on the next daily run once this much time has
          elapsed since the prospect first opened the proposal.
        </p>
      </div>

      <Button
        size="sm"
        disabled={!dirty || update.isPending}
        onClick={() => update.mutate({ proposalNudgeEnabled: enabled, proposalNudgeDelayHours: delayHours })}
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
