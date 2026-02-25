import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { uploadLogo } from "@/lib/supabase-storage";
import { NextResponse } from "next/server";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = user?.app_metadata?.organizationId as string | undefined;
    if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });

    const url = await uploadLogo(orgId, file);

    await db.organization.update({
      where: { id: orgId },
      data: { logoUrl: url },
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[logo upload]", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
