"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Require2FAToggleProps {
  require2FA: boolean;
}

export function Require2FAToggle({ require2FA: initial }: Require2FAToggleProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [require2FA, setRequire2FA] = useState(initial);
  const [confirming, setConfirming] = useState(false);

  const updateMutation = trpc.organization.update.useMutation();

  function handleToggle() {
    if (!require2FA) {
      // Enabling — show confirmation
      setConfirming(true);
      return;
    }

    // Disabling — apply immediately
    applyChange(false);
  }

  function applyChange(value: boolean) {
    updateMutation.mutate(
      { require2FA: value },
      {
        onSuccess: () => {
          setRequire2FA(value);
          setConfirming(false);
          toast.success(
            value
              ? "Two-factor authentication is now required for all team members."
              : "Two-factor authentication requirement removed."
          );
          startTransition(() => router.refresh());
        },
        onError: (err) => {
          toast.error(err.message);
          setConfirming(false);
        },
      }
    );
  }

  if (confirming) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            Require 2FA for all team members?
          </p>
          <p className="text-xs text-amber-700">
            All team members who have not yet set up two-factor authentication
            will be required to do so on their next sign-in. They will not be
            able to access the dashboard until they enroll.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => applyChange(true)}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Enabling..." : "Yes, require 2FA"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {require2FA ? (
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">
            {require2FA
              ? "Two-factor authentication is required"
              : "Two-factor authentication is optional"}
          </p>
          <p className="text-xs text-muted-foreground">
            {require2FA
              ? "All team members must enable 2FA to access the dashboard."
              : "Team members can optionally enable 2FA in their security settings."}
          </p>
        </div>
      </div>
      <Button
        variant={require2FA ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
        disabled={updateMutation.isPending}
      >
        {require2FA ? "Disable requirement" : "Require 2FA"}
      </Button>
    </div>
  );
}
