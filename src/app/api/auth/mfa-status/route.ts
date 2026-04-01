import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ require2FA: false, enrolled: false });
  }

  const organizationId = user.app_metadata?.organizationId as string | undefined;
  if (!organizationId) {
    return NextResponse.json({ require2FA: false, enrolled: false });
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { require2FA: true },
  });

  // Check if user has any verified TOTP factors
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = (factors?.totp ?? []).some((f) => f.status === "verified");

  return NextResponse.json({
    require2FA: org?.require2FA ?? false,
    enrolled,
  });
}
