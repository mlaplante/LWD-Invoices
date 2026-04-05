import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

/**
 * Migrates an existing Clerk user to Supabase Auth on first login.
 * Matches by email, links supabaseId in DB, stores organizationId in app_metadata.
 * Safe to call multiple times — no-ops if already migrated.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Already migrated
  if (user.app_metadata?.organizationId) {
    return NextResponse.json({ organizationId: user.app_metadata.organizationId });
  }

  if (!user.email) {
    return NextResponse.json({ error: "No email on account" }, { status: 400 });
  }

  // Find existing DB user by email
  const existingUser = await db.user.findFirst({
    where: { email: user.email },
  });

  if (!existingUser) {
    return NextResponse.json({ error: "no_existing_user" }, { status: 404 });
  }

  // Link supabaseId in DB (best-effort — column may not exist if DB migration hasn't run)
  try {
    await db.user.update({
      where: { id: existingUser.id },
      data: { supabaseId: user.id },
    });
  } catch (err) {
    console.warn("[auth/migrate] Could not set supabaseId — run DB migration SQL:", err);
  }

  // Look up primary org from UserOrganization join table
  const membership = await db.userOrganization.findFirst({
    where: { userId: existingUser.id },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const organizationId = membership?.organization.id ?? existingUser.organizationId;

  // Store organizationId in Supabase app_metadata
  const admin = createAdminClient();
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      organizationId,
      orgName: membership?.organization.name ?? null,
      userRole: membership?.role ?? existingUser.role,
    },
  });

  if (metaError) {
    console.error("[auth/migrate] Failed to set app_metadata:", metaError.message);
    return NextResponse.json({ error: "Failed to migrate account" }, { status: 500 });
  }

  return NextResponse.json({ organizationId });
}
