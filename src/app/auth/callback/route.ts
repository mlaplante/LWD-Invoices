import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const code = searchParams.get("code");
  // Prevent open redirect: only allow same-origin relative paths
  const next = safeRedirectPath(searchParams.get("next"));

  // Support invite redirect param (e.g. ?redirect=/invite/abc123).
  // Falls through to `next` (null here) when absent or unsafe.
  const rawRedirect = searchParams.get("redirect");
  const redirect =
    rawRedirect && safeRedirectPath(rawRedirect) === rawRedirect ? rawRedirect : null;

  const type = searchParams.get("type");
  if (type === "recovery" && code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  // Already migrated — just go to destination
  if (user.app_metadata?.organizationId) {
    return NextResponse.redirect(`${origin}${redirect ?? next}`);
  }

  // Data migration: match existing Clerk user by email on first Supabase login
  if (user.email) {
    try {
      const existingUser = await db.user.findFirst({
        where: { email: user.email },
      });

      if (existingUser) {
        // Link supabaseId (best-effort — column may not exist yet)
        try {
          await db.user.update({
            where: { id: existingUser.id },
            data: { supabaseId: user.id },
          });
        } catch (err) {
          console.warn("[auth/callback] Could not set supabaseId:", err);
        }

        // Store org info in app_metadata to avoid DB lookups on every request
        const membership = await db.userOrganization.findFirst({
          where: { userId: existingUser.id },
          include: { organization: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        });
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: {
            organizationId: membership?.organization.id ?? null,
            orgName: membership?.organization.name ?? null,
            userRole: membership?.role ?? null,
          },
        });

        // Refresh the session so the new app_metadata is in the JWT cookie
        await supabase.auth.refreshSession();

        return NextResponse.redirect(`${origin}${redirect ?? "/"}`);
      }
    } catch (err) {
      console.error("[auth/callback] Migration error:", err);
    }
  }

  // New user — send to onboarding
  return NextResponse.redirect(`${origin}/onboarding`);
}
