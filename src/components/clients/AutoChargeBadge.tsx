"use client";

import { CreditCard } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

interface AutoChargeBadgeProps {
  clientId: string;
  stripeCustomerId: string | null;
  autoChargeEnabled: boolean;
}

export function AutoChargeBadge({
  clientId,
  stripeCustomerId,
  autoChargeEnabled,
}: AutoChargeBadgeProps) {
  const toggleAutoCharge = trpc.clients.toggleAutoCharge.useMutation({
    onSuccess: (data: { autoChargeEnabled: boolean }) => {
      toast.success(
        data.autoChargeEnabled ? "Auto-charge enabled" : "Auto-charge disabled"
      );
    },
    onError: () => {
      toast.error("Failed to update auto-charge setting");
    },
  });

  if (!stripeCustomerId) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md">
        <CreditCard className="w-3 h-3" />
        Card on file
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Auto-charge</span>
        <Switch
          checked={toggleAutoCharge.isPending ? !autoChargeEnabled : autoChargeEnabled}
          disabled={toggleAutoCharge.isPending}
          onCheckedChange={(checked) =>
            toggleAutoCharge.mutate({ clientId, enabled: checked })
          }
        />
      </div>
    </div>
  );
}
