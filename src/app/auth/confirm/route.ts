import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "magiclink" | null;
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error("[auth/confirm] OTP verification failed:", error.message);
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_token`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
