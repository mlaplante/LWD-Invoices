"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ClosePeriodBanner({
  retainerId,
  periodLabel,
  periodEnd,
}: {
  retainerId: string;
  periodLabel: string;
  periodEnd: Date;
}) {
  const utils = trpc.useUtils();
  const close = trpc.hoursRetainers.closeAndRoll.useMutation({
    onSuccess: () => {
      toast.success("Period closed and next opened");
      utils.hoursRetainers.getDetail.invalidate({ id: retainerId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 flex items-center justify-between">
      <div className="text-sm">
        <strong>{periodLabel}</strong> period ended on{" "}
        {periodEnd.toLocaleDateString()}. Close it and open the next period?
      </div>
      <Button
        size="sm"
        onClick={() => close.mutate({ retainerId })}
        disabled={close.isPending}
      >
        Close &amp; open next
      </Button>
    </div>
  );
}
