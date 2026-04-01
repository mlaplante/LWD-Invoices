"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type LateFeeOrg = {
  lateFeeEnabled: boolean;
  lateFeeType: string | null;
  lateFeeAmount: number | { toNumber(): number };
  lateFeeGraceDays: number;
  lateFeeRecurring: boolean;
  lateFeeMaxApplications: number | null;
  lateFeeIntervalDays: number;
};

export function LateFeeSettingsForm({ org }: { org: LateFeeOrg }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const toNum = (v: number | { toNumber(): number }) =>
    typeof v === "object" && "toNumber" in v ? v.toNumber() : v;

  const [form, setForm] = useState({
    lateFeeEnabled: org.lateFeeEnabled,
    lateFeeType: org.lateFeeType ?? "flat",
    lateFeeAmount: toNum(org.lateFeeAmount),
    lateFeeGraceDays: org.lateFeeGraceDays,
    lateFeeRecurring: org.lateFeeRecurring,
    lateFeeMaxApplications: org.lateFeeMaxApplications,
    lateFeeIntervalDays: org.lateFeeIntervalDays,
  });

  const updateMutation = trpc.organization.update.useMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      {
        lateFeeEnabled: form.lateFeeEnabled,
        lateFeeType: form.lateFeeEnabled ? (form.lateFeeType as "flat" | "percentage") : null,
        lateFeeAmount: form.lateFeeAmount,
        lateFeeGraceDays: form.lateFeeGraceDays,
        lateFeeRecurring: form.lateFeeRecurring,
        lateFeeMaxApplications: form.lateFeeRecurring ? form.lateFeeMaxApplications : null,
        lateFeeIntervalDays: form.lateFeeIntervalDays,
      },
      {
        onSuccess: () => {
          toast.success("Late fee settings saved");
          startTransition(() => router.refresh());
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.lateFeeEnabled}
          onChange={(e) => setForm((f) => ({ ...f, lateFeeEnabled: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm font-medium">Enable automatic late fees</span>
      </label>

      {form.lateFeeEnabled && (
        <>
          {/* Fee type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Fee Type</label>
              <select
                value={form.lateFeeType}
                onChange={(e) => setForm((f) => ({ ...f, lateFeeType: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="flat">Flat Amount</option>
                <option value="percentage">Percentage of Total</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {form.lateFeeType === "percentage" ? "Percentage (%)" : "Amount"}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.lateFeeAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lateFeeAmount: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          {/* Grace days */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Grace Period (days)</label>
            <p className="text-xs text-muted-foreground mb-2">
              Number of days after the due date before the first late fee is applied.
            </p>
            <Input
              type="number"
              min="0"
              value={form.lateFeeGraceDays}
              onChange={(e) =>
                setForm((f) => ({ ...f, lateFeeGraceDays: parseInt(e.target.value) || 0 }))
              }
              className="max-w-[200px]"
            />
          </div>

          {/* Recurring toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.lateFeeRecurring}
              onChange={(e) =>
                setForm((f) => ({ ...f, lateFeeRecurring: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium">Apply recurring late fees</span>
          </label>

          {form.lateFeeRecurring && (
            <div className="grid gap-4 sm:grid-cols-2 pl-7">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Interval (days)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Days between each recurring late fee application.
                </p>
                <Input
                  type="number"
                  min="1"
                  value={form.lateFeeIntervalDays}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lateFeeIntervalDays: parseInt(e.target.value) || 30,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Max Applications
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Leave empty for unlimited.
                </p>
                <Input
                  type="number"
                  min="1"
                  value={form.lateFeeMaxApplications ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lateFeeMaxApplications: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    }))
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>
          )}
        </>
      )}

      <Button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving..." : "Save Late Fee Settings"}
      </Button>
    </form>
  );
}
