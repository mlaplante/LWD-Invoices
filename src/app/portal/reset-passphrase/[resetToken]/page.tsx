"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PortalResetPassphrasePage() {
  const params = useParams<{ resetToken: string }>();
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/reset-passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.resetToken, passphrase }),
      });
      const data = (await res.json()) as { error?: string; loginUrl?: string };
      if (res.ok && data.loginUrl) {
        setLoginUrl(data.loginUrl);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loginUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">Passphrase updated</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your new passphrase is set. Use it the next time you open one of
            your portal links.
          </p>
          <Button className="w-full" onClick={() => router.push(loginUrl)}>
            Go to Client Portal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8">
        <h1 className="text-xl font-bold text-foreground mb-2">Choose a new passphrase</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter a new passphrase for your client portal. It must be at least 8
          characters.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">New passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm passphrase</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter passphrase"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Set New Passphrase"}
          </Button>
        </form>
      </div>
    </div>
  );
}
