"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export function DunningToggle() {
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.organization.get.useQuery();
  const update = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Payment recovery setting updated");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Automatic payment recovery</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            When an automatic charge fails, retry the saved payment method 1, 3,
            and 7 days later. If every retry fails — or the card is missing or
            expired — the client is emailed a pay link and you&rsquo;re notified.
          </p>
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-11" />
        ) : (
          <Switch
            checked={!!org?.dunningEnabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => update.mutate({ dunningEnabled: checked })}
            aria-label="Toggle automatic payment recovery"
          />
        )}
      </div>
    </div>
  );
}
