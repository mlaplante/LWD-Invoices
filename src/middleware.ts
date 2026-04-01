import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/onboarding",
  "/portal",
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

  // Refresh session — MUST be called before any redirect logic
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return supabaseResponse;
  }

  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Check MFA assurance level — redirect to challenge if MFA enrolled but not verified
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

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

  // Redirect authenticated users without an org to onboarding
  const organizationId = user.app_metadata?.organizationId as string | undefined;
  if (!organizationId && pathname !== "/onboarding") {
    const onboardingUrl = new URL("/onboarding", request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
