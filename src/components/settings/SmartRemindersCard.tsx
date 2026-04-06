"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SmartRemindersCard() {
  const utils = trpc.useUtils();
  const { data: org } = trpc.organization.get.useQuery();

  const [enabled, setEnabled] = useState(org?.smartRemindersEnabled ?? false);
  const [threshold, setThreshold] = useState(org?.smartRemindersThreshold ?? 80);

  const mutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Smart reminders settings saved");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!org) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Smart Reminders
        </p>
        <p className="text-base font-semibold mt-1">Skip Pre-Due Reminders for Reliable Clients</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Clients who consistently pay on time won&apos;t receive pre-due reminder emails. Post-due reminders always send.
        </p>
      </div>
      <div className="px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="smart-toggle">Enable smart reminders</Label>
          <Switch id="smart-toggle" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        {enabled && (
          <div className="space-y-1">
            <Label htmlFor="smart-threshold">On-time payment threshold</Label>
            <div className="flex items-center gap-2">
              <Input
                id="smart-threshold"
                type="number"
                min={50}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 80)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">% of invoices paid on time</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clients with fewer than 3 paid invoices always receive all reminders.
            </p>
          </div>
        )}
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ smartRemindersEnabled: enabled, smartRemindersThreshold: threshold })}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
