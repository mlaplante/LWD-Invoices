"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type Mode = "password" | "magic-link" | "magic-link-sent";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    const { data: aalData } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === "aal2" && aalData.currentLevel === "aal1") {
      // User has MFA enrolled — redirect to challenge page
      const searchParams = new URLSearchParams(window.location.search);
      const redirectTo = searchParams.get("redirect");
      const mfaUrl = `/mfa-challenge${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;
      router.push(mfaUrl);
      setLoading(false);
      return;
    }

    // Run migration for existing Clerk users (sets organizationId in app_metadata)
    const migrateRes = await fetch("/api/auth/migrate", { method: "POST" });
    if (!migrateRes.ok && migrateRes.status !== 404) {
      // 404 = no existing user (new user), all other errors are real failures
      const data = await migrateRes.json().catch(() => ({}));
      setError(data.error ?? "Sign in failed. Please try again.");
      setLoading(false);
      return;
    }

    // Refresh the session so the new app_metadata.organizationId is in the JWT cookie
    await getSupabase().auth.refreshSession();

    const searchParams = new URLSearchParams(window.location.search);
    const redirectTo = searchParams.get("redirect");
    router.push(redirectTo ?? "/");
    setLoading(false);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: (() => {
          const sp = new URLSearchParams(window.location.search);
          const redir = sp.get("redirect");
          return `${window.location.origin}/auth/callback${redir ? `?redirect=${encodeURIComponent(redir)}` : ""}`;
        })(),
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setMode("magic-link-sent");
    }
    setLoading(false);
  }

  async function handleGitHub() {
    setLoading(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: (() => {
          const sp = new URLSearchParams(window.location.search);
          const redir = sp.get("redirect");
          return `${window.location.origin}/auth/callback${redir ? `?redirect=${encodeURIComponent(redir)}` : ""}`;
        })(),
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  if (mode === "magic-link-sent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            We sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setMode("magic-link")}>
            Resend link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back to LWD Invoices
          </p>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-magic">Email</Label>
              <Input
                id="email-magic"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-muted/40 px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGitHub}
            disabled={loading}
          >
            <GithubIcon className="w-4 h-4 mr-2" />
            Continue with GitHub
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm"
            onClick={() =>
              setMode(mode === "password" ? "magic-link" : "password")
            }
          >
            {mode === "password"
              ? "Sign in with magic link instead"
              : "Sign in with password instead"}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
