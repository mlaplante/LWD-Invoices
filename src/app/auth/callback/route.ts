import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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
    return NextResponse.redirect(`${origin}${next}`);
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

        // Store organizationId in app_metadata
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: { organizationId: existingUser.organizationId },
        });

        // Refresh the session so the new app_metadata is in the JWT cookie
        await supabase.auth.refreshSession();

        return NextResponse.redirect(`${origin}/`);
      }
    } catch (err) {
      console.error("[auth/callback] Migration error:", err);
    }
  }

  // New user — send to onboarding
  return NextResponse.redirect(`${origin}/onboarding`);
}
