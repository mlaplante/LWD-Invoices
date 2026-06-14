"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Estimated quarterly tax settings. Drives the recommended set-aside on the
 * Estimated Taxes report and, when reminders are on, the email nudge sent
 * `reminderDays` before each federal due date.
 */
export function EstimatedTaxSettings() {
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.organization.get.useQuery();

  const [percent, setPercent] = useState("30");
  const [reminderDays, setReminderDays] = useState("7");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!org) return;
    setPercent(String(Number(org.estimatedTaxSetAsidePercent) || 30));
    setReminderDays(String(org.estimatedTaxReminderDays || 7));
    setDirty(false);
  }, [org]);

  const update = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Estimated-tax settings updated");
      setDirty(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !org) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  const parsedPercent = parseFloat(percent);
  const parsedDays = parseInt(reminderDays, 10);
  const valid =
    Number.isFinite(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 60 &&
    Number.isInteger(parsedDays) &&
    parsedDays >= 1 &&
    parsedDays <= 30;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/50 bg-background/50 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Set-aside percentage</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              We recommend reserving this share of your net self-employment income
              (payments received − deductible expenses − mileage) each quarter. A
              flat 25–35% is a common rule of thumb; adjust to your bracket.
            </p>
          </div>
          <div className="shrink-0">
            <Label htmlFor="set-aside-percent" className="text-xs">
              Set-aside %
            </Label>
            <Input
              id="set-aside-percent"
              type="number"
              min={0}
              max={60}
              step={1}
              value={percent}
              onChange={(e) => {
                setPercent(e.target.value);
                setDirty(true);
              }}
              className="mt-1 w-24"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/50 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Email me before each due date</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Get a heads-up with your recommended payment before each federal
              quarterly deadline (Apr 15 · Jun 15 · Sep 15 · Jan 15). Sent to org
              owners and admins.
            </p>
            {org.estimatedTaxReminderLastSentAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Last reminder sent{" "}
                {new Date(org.estimatedTaxReminderLastSentAt).toLocaleString()}
              </p>
            )}
          </div>
          <Switch
            checked={!!org.estimatedTaxEnabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => update.mutate({ estimatedTaxEnabled: checked })}
            aria-label="Toggle estimated-tax reminders"
          />
        </div>

        {org.estimatedTaxEnabled && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="reminder-days" className="text-xs">
                Days before due date
              </Label>
              <Input
                id="reminder-days"
                type="number"
                min={1}
                max={30}
                value={reminderDays}
                onChange={(e) => {
                  setReminderDays(e.target.value);
                  setDirty(true);
                }}
                className="mt-1 w-24"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!dirty || !valid || update.isPending}
          onClick={() =>
            update.mutate({
              estimatedTaxSetAsidePercent: parsedPercent,
              estimatedTaxReminderDays: parsedDays,
            })
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        {!valid && dirty && (
          <p className="text-xs text-destructive">
            Set-aside must be 0–60% and reminder lead time 1–30 days.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Estimates are a planning aid, not tax advice. Confirm amounts and
        deadlines with your accountant or the IRS.
      </p>
    </div>
  );
}
