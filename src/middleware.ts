import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getRateLimiters, getBucketForPath } from "@/lib/rate-limiter";

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
  "/api/inngest",
  "/api/onboarding",
  "/api/auth",
  "/api/portal",
  "/api/v1",
  "/auth/callback",
  "/auth/confirm",
  "/mfa-challenge",
  "/mfa-enroll",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
    return supabaseResponse;
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
  // MFA is relevant (org requires 2FA or user previously enrolled).
  // This avoids 1-2 extra network round-trips on every authenticated request.
  const orgRequire2FA = user.app_metadata?.require2FA as boolean | undefined;
  const mfaEnrolled = user.app_metadata?.mfaEnrolled as boolean | undefined;

  if (orgRequire2FA || mfaEnrolled) {
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
      const hasVerifiedFactor = aal?.nextLevel === "aal2";
      if (!hasVerifiedFactor) {
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

  return supabaseResponse;
}

export const runtime = "experimental-edge";

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
