import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

/**
 * Runs the email→orgId migration for users who sign in via email/password.
 * OAuth/magic-link users go through /auth/callback which handles migration there.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  // Already migrated — nothing to do
  if (user.app_metadata?.organizationId) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Match existing user by email (migrating from Clerk)
  const existingUser = await db.user.findFirst({
    where: { email: user.email!, supabaseId: null },
  });

  if (existingUser) {
    await db.user.update({
      where: { id: existingUser.id },
      data: { supabaseId: user.id },
    });

    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { organizationId: existingUser.organizationId },
    });

    return NextResponse.redirect(`${origin}${next}`);
  }

  // No existing record — send to onboarding
  return NextResponse.redirect(`${origin}/onboarding`);
}
