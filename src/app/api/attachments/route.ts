import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { uploadFile } from "@/server/services/storage";
import { AttachmentContext } from "@/generated/prisma";
import {
  SAFE_DOCUMENT_MIME_TYPES,
  SAFE_IMAGE_MIME_TYPES,
  SAFE_TEXT_MIME_TYPES,
} from "@/lib/file-validation";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set<string>([
  ...SAFE_IMAGE_MIME_TYPES,
  ...SAFE_DOCUMENT_MIME_TYPES,
  ...SAFE_TEXT_MIME_TYPES,
]);

async function contextBelongsToOrg(
  context: AttachmentContext,
  contextId: string,
  organizationId: string,
): Promise<boolean> {
  switch (context) {
    case "INVOICE":
      return Boolean(await db.invoice.findFirst({ where: { id: contextId, organizationId }, select: { id: true } }));
    case "PROJECT":
      return Boolean(await db.project.findFirst({ where: { id: contextId, organizationId }, select: { id: true } }));
    case "CLIENT":
      return Boolean(await db.client.findFirst({ where: { id: contextId, organizationId }, select: { id: true } }));
    case "TICKET":
      return Boolean(await db.ticket.findFirst({ where: { id: contextId, organizationId }, select: { id: true } }));
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedOrg();
  if (isAuthError(auth)) return auth;
  const { orgId, user } = auth;
  const userId = user.id;

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

  if (!(await contextBelongsToOrg(context, contextId, org.id))) {
    return NextResponse.json({ error: "Attachment context not found" }, { status: 404 });
  }

  let path: string;
  try {
    ({ path } = await uploadFile(
      file.name,
      file,
      `${org.id}/${context.toLowerCase()}/${contextId}`,
      [...ALLOWED_TYPES],
    ));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }

  const attachment = await db.attachment.create({
    data: {
      filename: file.name,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      // Private bucket: store the storage path; downloads go through
      // /api/attachments/[id]/download which mints a signed URL.
      storageUrl: path,
      context,
      contextId,
      uploadedById: userId,
      organizationId: org.id,
    },
  });

  return NextResponse.json(attachment);
}
