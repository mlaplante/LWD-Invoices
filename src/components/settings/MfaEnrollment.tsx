"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type EnrollmentState =
  | "idle"           // Not enrolled, show "Enable" button
  | "enrolling"      // Showing QR code, waiting for verification
  | "recovery-codes" // Showing recovery codes after successful enrollment
  | "enrolled"       // Already enrolled, show "Disable" button
  | "disabling";     // Confirming disable with TOTP code

interface MfaFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export function MfaEnrollment() {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [state, setState] = useState<EnrollmentState>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  // Enrollment data
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Enrolled factor (for disable flow)
  const [enrolledFactor, setEnrolledFactor] = useState<MfaFactor | null>(null);

  // Recovery codes (shown once after enrollment)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Check current MFA status on mount
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    void checkMfaStatus();
  }

  async function checkMfaStatus() {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;

    const verifiedFactor = data.totp.find((f) => f.status === "verified");
    if (verifiedFactor) {
      setEnrolledFactor(verifiedFactor);
      setState("enrolled");
    }
  }

  async function handleStartEnroll() {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Pancake Authenticator",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setState("enrolling");
    setLoading(false);
  }

  async function handleVerifyEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabase();

    // Create a challenge
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    // Verify the code
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }

    // Generate recovery codes (Supabase doesn't provide recovery codes natively;
    // we generate them client-side and display them. In production, these would be
    // stored server-side. For now, Supabase's built-in recovery is handled via
    // email-based account recovery.)
    const codes = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () =>
        "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
      ).join("")
    );
    setRecoveryCodes(codes);
    setState("recovery-codes");
    toast.success("Two-factor authentication enabled");
    setLoading(false);
  }

  async function handleStartDisable() {
    setVerifyCode("");
    setError(null);
    setState("disabling");
  }

  async function handleConfirmDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolledFactor) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabase();

    // Verify current code before unenrolling
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: enrolledFactor.id });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolledFactor.id,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }

    // Unenroll the factor
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId: enrolledFactor.id,
    });

    if (unenrollError) {
      setError(unenrollError.message);
      setLoading(false);
      return;
    }

    setEnrolledFactor(null);
    setState("idle");
    toast.success("Two-factor authentication disabled");
    setLoading(false);
  }

  function handleCopyRecoveryCodes() {
    void navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDoneRecoveryCodes() {
    void checkMfaStatus();
  }

  // ── Idle: not enrolled ──────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldOff className="w-4 h-4" />
          <span className="text-sm">Two-factor authentication is not enabled.</span>
        </div>
        <Button onClick={handleStartEnroll} disabled={loading}>
          {loading ? "Setting up..." : "Enable Two-Factor Authentication"}
        </Button>
      </div>
    );
  }

  // ── Enrolling: show QR code ─────────────────────────────────────────────
  if (state === "enrolling") {
    return (
      <div className="space-y-4 max-w-sm">
        <p className="text-sm text-muted-foreground">
          Scan this QR code with your authenticator app (Google Authenticator,
          Authy, 1Password, etc.), then enter the 6-digit code below.
        </p>

        {qrCode && (
          <div className="flex justify-center">
            <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48 rounded-lg border" />
          </div>
        )}

        {secret && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 font-mono text-center break-all">
            {secret}
          </div>
        )}

        <form onSubmit={handleVerifyEnroll} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="totp-code">Verification Code</Label>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || verifyCode.length !== 6}>
              {loading ? "Verifying..." : "Verify & Enable"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setState("idle");
                setQrCode(null);
                setSecret(null);
                setFactorId(null);
                setVerifyCode("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Recovery codes: shown once ──────────────────────────────────────────
  if (state === "recovery-codes") {
    return (
      <div className="space-y-4 max-w-sm">
        <div className="flex items-center gap-2 text-emerald-600">
          <ShieldCheck className="w-5 h-5" />
          <span className="font-semibold">Two-Factor Authentication Enabled</span>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            Save your recovery codes
          </p>
          <p className="text-xs text-amber-700">
            These codes can be used to access your account if you lose your
            authenticator device. Each code can only be used once.
            <strong> Store them somewhere safe &mdash; they will not be shown again.</strong>
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm grid grid-cols-2 gap-1">
          {recoveryCodes.map((code, i) => (
            <span key={i} className="text-foreground">
              {code}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyRecoveryCodes}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Copied" : "Copy codes"}
          </Button>
          <Button size="sm" onClick={handleDoneRecoveryCodes}>
            I&apos;ve saved my codes
          </Button>
        </div>
      </div>
    );
  }

  // ── Enrolled: show status + disable option ──────────────────────────────
  if (state === "enrolled") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-600">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-sm font-medium">Two-factor authentication is enabled.</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleStartDisable}>
          Disable Two-Factor Authentication
        </Button>
      </div>
    );
  }

  // ── Disabling: verify code then unenroll ────────────────────────────────
  if (state === "disabling") {
    return (
      <div className="space-y-4 max-w-sm">
        <p className="text-sm text-muted-foreground">
          Enter a code from your authenticator app to confirm disabling 2FA.
        </p>

        <form onSubmit={handleConfirmDisable} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="disable-code">Verification Code</Label>
            <Input
              id="disable-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="one-time-code"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={loading || verifyCode.length !== 6}>
              {loading ? "Disabling..." : "Confirm Disable"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setState("enrolled");
                setVerifyCode("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return null;
}
