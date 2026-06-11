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
 * Early-payment discount ("2/10 net 30") settings. The percent/days pair is
 * snapshotted onto each new invoice at creation, so changes here only affect
 * invoices created afterwards.
 */
export function EarlyPayDiscountSettings() {
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.organization.get.useQuery();

  const [percent, setPercent] = useState("2");
  const [days, setDays] = useState("10");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!org) return;
    setPercent(String(Number(org.earlyPayDiscountPercent) || 2));
    setDays(String(org.earlyPayDiscountDays || 10));
    setDirty(false);
  }, [org]);

  const update = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Early-payment discount updated");
      setDirty(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !org) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  const parsedPercent = parseFloat(percent);
  const parsedDays = parseInt(days, 10);
  const valid =
    Number.isFinite(parsedPercent) &&
    parsedPercent > 0 &&
    parsedPercent <= 50 &&
    Number.isInteger(parsedDays) &&
    parsedDays >= 1 &&
    parsedDays <= 60;

  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Offer an early-payment discount</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Clients who pay the full balance online within the window get the
            discount automatically — e.g. “2% if paid within 10 days”. Applied
            after tax, and only to new invoices created while this is on.
          </p>
        </div>
        <Switch
          checked={!!org.earlyPayDiscountEnabled}
          disabled={update.isPending}
          onCheckedChange={(checked) => update.mutate({ earlyPayDiscountEnabled: checked })}
          aria-label="Toggle early-payment discount"
        />
      </div>

      {org.earlyPayDiscountEnabled && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="early-pay-percent" className="text-xs">
              Discount %
            </Label>
            <Input
              id="early-pay-percent"
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={percent}
              onChange={(e) => {
                setPercent(e.target.value);
                setDirty(true);
              }}
              className="mt-1 w-24"
            />
          </div>
          <div>
            <Label htmlFor="early-pay-days" className="text-xs">
              Days from invoice date
            </Label>
            <Input
              id="early-pay-days"
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setDirty(true);
              }}
              className="mt-1 w-24"
            />
          </div>
          <Button
            size="sm"
            disabled={!dirty || !valid || update.isPending}
            onClick={() =>
              update.mutate({
                earlyPayDiscountPercent: parsedPercent,
                earlyPayDiscountDays: parsedDays,
              })
            }
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          {!valid && dirty && (
            <p className="text-xs text-destructive">
              Percent must be 0.5–50 and days 1–60.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
