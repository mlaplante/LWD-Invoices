import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { uploadLogo } from "@/lib/supabase-storage";
import { NextResponse } from "next/server";
import { SAFE_IMAGE_MIME_TYPES } from "@/lib/file-validation";

const ALLOWED_TYPES = SAFE_IMAGE_MIME_TYPES;
const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_TYPES);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedOrg();
    if (isAuthError(auth)) return auth;
    const { orgId, user } = auth;

    // Changing org branding is an organization.update-class action, which the
    // tRPC layer restricts to OWNER/ADMIN (see requireRole("OWNER", "ADMIN")
    // on the `update` mutation in src/server/routers/organization.ts). Mirror
    // that gate here since this REST route performs the same effective write.
    const dbUser = await db.user.findFirst({
      where: { supabaseId: user.id },
      select: { id: true },
    });
    const membership = dbUser
      ? await db.userOrganization.findUnique({
          where: { userId_organizationId: { userId: dbUser.id, organizationId: orgId } },
          select: { role: true },
        })
      : null;
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPE_SET.has(file.type))
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
