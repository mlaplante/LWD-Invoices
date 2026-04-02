import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { uploadFile } from "@/server/services/storage";
import { AttachmentContext } from "@/generated/prisma";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const context = formData.get("context") as AttachmentContext | null;
  const contextId = formData.get("contextId") as string | null;

  if (!file || !context || !contextId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  // Validate context is a known enum value
  const validContexts = new Set(Object.values(AttachmentContext));
  if (!validContexts.has(context)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url } = await uploadFile(
    file.name,
    file,
    `${org.id}/${context.toLowerCase()}/${contextId}`,
  );

  const attachment = await db.attachment.create({
    data: {
      filename: file.name,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      storageUrl: url,
      context,
      contextId,
      uploadedById: userId,
      organizationId: org.id,
    },
  });

  return NextResponse.json(attachment);
}
