import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/server/db";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Already has an org — don't create a duplicate
  if (user.app_metadata?.organizationId) {
    return NextResponse.json({ error: "Organization already exists" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  // Create org in DB
  const org = await db.organization.create({
    data: { id: `org_${crypto.randomUUID()}`, name },
  });

  // Upsert user record
  await db.user.upsert({
    where: { supabaseId: user.id },
    update: { organizationId: org.id },
    create: {
      supabaseId: user.id,
      email: user.email!,
      firstName: user.user_metadata?.firstName ?? null,
      lastName: user.user_metadata?.lastName ?? null,
      organizationId: org.id,
    },
  });

  // Store organizationId in Supabase app_metadata
  const admin = createAdminClient();
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { organizationId: org.id },
  });

  if (metaError) {
    console.error("[onboarding] Failed to set app_metadata:", metaError.message);
    return NextResponse.json({ error: "Failed to configure account" }, { status: 500 });
  }

  return NextResponse.json({ organizationId: org.id });
}
