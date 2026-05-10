"use client";

import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export function StripeTaxToggle() {
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.organization.get.useQuery();
  const setEnabled = trpc.organization.setStripeTaxEnabled.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Stripe Tax setting updated");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Use Stripe Tax</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Calculate sales tax / VAT / GST automatically using Stripe Tax,
            including state, county, and city breakdowns. Requires an active
            Stripe gateway, a complete origin address, and tax registrations
            configured in your Stripe dashboard.
          </p>
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-11" />
        ) : (
          <Switch
            checked={!!org?.stripeTaxEnabled}
            disabled={setEnabled.isPending}
            onCheckedChange={(checked) => setEnabled.mutate({ enabled: checked })}
            aria-label="Toggle Stripe Tax"
          />
        )}
      </div>
    </div>
  );
}
