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

  // Data migration: match existing user by email on first Supabase login
  const existingUser = await db.user.findFirst({
    where: { email: user.email!, supabaseId: null },
  });

  if (existingUser) {
    // Link Supabase ID to existing DB record
    await db.user.update({
      where: { id: existingUser.id },
      data: { supabaseId: user.id },
    });

    // Store organizationId in Supabase app_metadata
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { organizationId: existingUser.organizationId },
    });

    return NextResponse.redirect(`${origin}/`);
  }

  // Check if user already has org in app_metadata (returning user)
  if (user.app_metadata?.organizationId) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // New user — send to onboarding
  return NextResponse.redirect(`${origin}/onboarding`);
}
