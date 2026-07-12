"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { AuthShell } from "@/components/layout/AuthShell";

export default function MfaChallengePage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabase();

    // List factors to find the TOTP factor
    const { data: factorsData, error: factorsError } =
      await supabase.auth.mfa.listFactors();

    if (factorsError || !factorsData.totp.length) {
      setError("No authenticator found. Please contact support.");
      setLoading(false);
      return;
    }

    const factor = factorsData.totp.find((f) => f.status === "verified");
    if (!factor) {
      setError("No verified authenticator found.");
      setLoading(false);
      return;
    }

    // Create challenge
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: factor.id });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    // Verify code — this upgrades the session from AAL1 to AAL2
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setCode("");
      setLoading(false);
      return;
    }

    // Successfully verified — redirect to dashboard or original destination
    const searchParams = new URLSearchParams(window.location.search);
    const redirectTo = searchParams.get("redirect");
    router.push(safeRedirectPath(redirectTo));
    router.refresh();
  }

  return (
    <AuthShell title="Two-factor verification" description="Enter the six-digit code from your authenticator app.">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Authentication Code</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="one-time-code"
              autoFocus
              className="text-center text-lg tracking-widest font-mono"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Lost access to your authenticator?{" "}
          <a href="mailto:support@example.com" className="text-primary hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
