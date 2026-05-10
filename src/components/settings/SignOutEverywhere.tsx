"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

/**
 * Revokes every session associated with the current user across all
 * devices/browsers. Useful when a device is lost or the user suspects
 * a credential leak — they can come here, click once, and force fresh
 * logins everywhere (including this tab).
 *
 * Implemented via Supabase Auth's signOut({ scope: 'global' }), which
 * invalidates all refresh tokens for the user. The current tab's session
 * dies too, so we redirect to /auth/sign-in immediately after.
 */
export function SignOutEverywhere() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!confirm("Sign out of all devices? You'll need to sign in again on each.")) {
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Signed out everywhere.");
      router.replace("/auth/sign-in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-out failed");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <LogOut className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Sign out of all sessions</p>
          <p className="text-xs text-muted-foreground">
            Revoke every active session for your account on all devices.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Signing out…" : "Sign out everywhere"}
      </Button>
    </div>
  );
}
