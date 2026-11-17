import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getRateLimiters, getBucketForPath } from "@/lib/rate-limiter";
import { buildNonceCsp, generateNonce, getCspMode, sentryCspReportUri } from "@/lib/csp";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/portal",
  "/pay",
  "/api/pay",
  "/api/webhooks",
  "/api/trpc",
  "/api/warmup",
  "/api/inngest",
  "/api/onboarding",
  "/api/auth",
  "/api/portal",
  "/api/v1",
  "/auth/callback",
  "/auth/confirm",
  "/mfa-challenge",
  "/mfa-enroll",
  // Token-gated surfaces for people who have no account by design. Each
  // authenticates on its own unguessable token (or, for /invite, does its own
  // sign-in redirect that preserves the token). Without these entries a
  // logged-out contractor, invitee, or a mailbox provider's one-click
  // unsubscribe POST was bounced to /sign-in and the feature never ran.
  "/contractor",
  "/api/contractor-portal",
  "/invite",
  "/unsubscribe",
  "/api/email-preferences",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

export async function proxy(request: NextRequest) {
  // This app defines no Server Actions ("use server"), so any request carrying
  // a Next-Action header is forged — typically a scanner probing for
  // React Server Components exploits. Left alone, Next tries to resolve the
  // unknown action and throws "InvariantError: Expected RSC response, got
  // text/plain" (unhandled, reported to Sentry). Reject it before Next's
  // action handler runs. If Server Actions are ever introduced, remove this.
  if (request.headers.has("next-action")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Per-request CSP nonce (see src/lib/csp.ts). Next reads the nonce from the
  // CSP *request* header and stamps it on every script it emits, so the
  // header has to ride on the forwarded request as well as the response.
  const cspMode = getCspMode();
  const nonce = cspMode === "off" ? null : generateNonce();
  const cspHeaderName =
    cspMode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
  const nonceCsp = nonce
    ? buildNonceCsp({
        nonce,
        isDev: process.env.NODE_ENV === "development",
        reportUri: sentryCspReportUri(),
      })
    : null;

  // Build the pass-through response from the request's *current* headers, so
  // cookies the Supabase client refreshes (request.cookies.set mutates them)
  // are forwarded together with the nonce.
  const forward = () => {
    if (!nonce || !nonceCsp) return NextResponse.next({ request });
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set(cspHeaderName, nonceCsp);
    return NextResponse.next({ request: { headers } });
  };
  const withCsp = <T extends NextResponse>(res: T): T => {
    if (nonceCsp) res.headers.set(cspHeaderName, nonceCsp);
    return res;
  };

  let supabaseResponse = forward();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname } = request.nextUrl;

  // Rate limiting for public endpoints
  const bucket = getBucketForPath(request.nextUrl.pathname);
  if (bucket) {
    const limiters = getRateLimiters();
    if (limiters) {
      // Use Netlify's trusted IP header first, fall back to last x-forwarded-for entry
      const ip = request.headers.get("x-nf-client-connection-ip")
        ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
        ?? request.headers.get("x-real-ip")
        ?? "unknown";
      const { success, limit, remaining, reset } = await limiters[bucket].limit(ip);
      if (!success) {
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        });
      }
    }
  }

  // Skip auth check entirely for public paths — saves a Supabase round-trip
  if (isPublicPath(pathname)) {
    return withCsp(supabaseResponse);
  }

  // Refresh session — MUST be called before any redirect logic
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // MFA checks — only call Supabase MFA APIs when there's reason to believe
  // MFA is relevant (org requires 2FA or the user has a verified factor).
  // This avoids 1-2 extra network round-trips on every authenticated request.
  //
  // Enrollment state is read from the user's actual factors (getUser() returns
  // them, so no extra round-trip), NOT from an app_metadata.mfaEnrolled flag:
  // that flag was never written anywhere, so a user who self-enrolled TOTP in
  // an org that doesn't org-wide require 2FA would otherwise skip the aal2
  // step-up entirely, leaving an attacker with only the password able to reach
  // the dashboard on an aal1 session despite the enrolled second factor.
  const orgRequire2FA = user.app_metadata?.require2FA as boolean | undefined;
  const hasVerifiedFactor = (user.factors ?? []).some(
    (f) => f.status === "verified",
  );

  if (orgRequire2FA || hasVerifiedFactor) {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    // Redirect to challenge if MFA enrolled but not verified this session
    if (
      aal?.nextLevel === "aal2" &&
      aal.currentLevel !== "aal2" &&
      !pathname.startsWith("/mfa-challenge") &&
      !pathname.startsWith("/mfa-enroll")
    ) {
      const mfaChallengeUrl = new URL("/mfa-challenge", request.url);
      mfaChallengeUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(mfaChallengeUrl);
    }

    // Org enforcement: if org requires 2FA and user isn't enrolled, redirect to enrollment
    if (orgRequire2FA && !pathname.startsWith("/mfa-enroll")) {
      const enrolled = aal?.nextLevel === "aal2";
      if (!enrolled) {
        const enrollUrl = new URL("/mfa-enroll", request.url);
        return NextResponse.redirect(enrollUrl);
      }
    }
  }

  // Redirect authenticated users without an org to onboarding
  const organizationId = user.app_metadata?.organizationId as string | undefined;
  if (!organizationId && pathname !== "/onboarding") {
    const onboardingUrl = new URL("/onboarding", request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  return withCsp(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
