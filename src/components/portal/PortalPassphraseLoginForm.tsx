"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  title: string;
  description: string;
  /** Endpoint that verifies the passphrase and sets the session cookie. */
  authUrl: string;
  /** Where to navigate after a successful sign-in. */
  successUrl: string;
  submitLabel: string;
  /** Portal token (client or invoice) used for the forgot-passphrase request. */
  portalToken: string;
};

/**
 * Shared passphrase gate for the invoice portal and the client dashboard
 * portal, including the self-service "Forgot passphrase?" flow.
 */
export function PortalPassphraseLoginForm({
  title,
  description,
  authUrl,
  successUrl,
  submitLabel,
  portalToken,
}: Props) {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        router.push(successUrl);
        router.refresh();
      } else {
        setError("Incorrect passphrase. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot() {
    setSendingReset(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/portal/request-passphrase-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: portalToken }),
      });
      if (res.ok) {
        setNotice("If this portal has an email on file, a reset link has been sent.");
      } else if (res.status === 429) {
        setError("Too many reset requests. Please try again later.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8">
        <h1 className="text-xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {notice}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying..." : submitLabel}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleForgot}
          disabled={sendingReset}
          className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {sendingReset ? "Sending..." : "Forgot passphrase?"}
        </button>
      </div>
    </div>
  );
}
